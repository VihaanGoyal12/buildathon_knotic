const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const https = require('https');

// 1. Manually parse .env file
const envPath = path.join(__dirname, '.env');
const config = {
  DEMO_MODE: process.env.DEMO_MODE || 'false', PORT: '3000',
  GEMINI_API_KEY: '',
  RESEND_API_KEY: ''
};

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      let value = parts.slice(1).join('=').trim();
      // Strip enclosing single or double quotes
      if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
        value = value.substring(1, value.length - 1);
      }
      config[key] = value;
      process.env[key] = value;
    }
  });
}

const DEMO_MODE = config.DEMO_MODE === 'true';
const PORT = parseInt(config.PORT || '3000', 10);
const GEMINI_API_KEY = config.GEMINI_API_KEY || '';
const RESEND_API_KEY = config.RESEND_API_KEY || '';

console.log(`[Config] DEMO_MODE: ${DEMO_MODE}`);
console.log(`[Config] PORT: ${PORT}`);
console.log(`[Config] GEMINI_API_KEY: ${GEMINI_API_KEY ? 'Present' : 'Not Configured'}`);
console.log(`[Config] RESEND_API_KEY: ${RESEND_API_KEY ? 'Present' : 'Not Configured'}`);

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// Helper: Serve static file
function serveStaticFile(res, filePath) {
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// Helper: Parse JSON POST body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Helper: Execute Swytchcode via subprocess
function execSwytchcode(tool, args) {
  return new Promise((resolve, reject) => {
    const payload = {
      tool: tool,
      args: args
    };
    const payloadStr = JSON.stringify(payload).replace(/'/g, "'\\''");
    // HOME must point to real user home so swytchcode can read ~/.swytchcode/auth.json credentials
    const cmd = `echo '${payloadStr}' | HOME=/Users/vihaangoyal swytchcode exec --json`;
    console.log(`[Swytchcode] Executing: ${tool}`);
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Swytchcode Error] Tool: ${tool}, Stderr: ${stderr}`);
        return reject({ error: error.message, stderr, stdout });
      }
      // Filter out posthog warning lines that Swytchcode emits to stdout in some environments
      const cleanedStdout = stdout
        .split('\n')
        .filter(line => !line.startsWith('posthog '))
        .join('\n')
        .trim();
      try {
        const parsed = JSON.parse(cleanedStdout);
        if (parsed.error) {
          console.error(`[Swytchcode Error] Tool: ${tool}, Error:`, parsed.error);
          return reject({ error: parsed.error, stderr, stdout });
        }
        if (parsed.status_code && parsed.status_code >= 400) {
          console.error(`[Swytchcode Error] Tool: ${tool}, Status Code: ${parsed.status_code}`);
          const errorMsg = parsed.data && parsed.data.error && parsed.data.error.message
            ? parsed.data.error.message
            : `API error (${parsed.status_code})`;
          return reject({ error: errorMsg, stderr, stdout });
        }
        resolve(parsed.hasOwnProperty('data') ? parsed.data : parsed);
      } catch (parseError) {
        console.warn(`[Swytchcode Warn] Failed to parse JSON stdout: ${cleanedStdout}`);
        resolve({ raw: cleanedStdout, stderr });
      }
    });
  });
}

// Helper: Extract Notion page title from properties schema
function getPageTitle(page) {
  if (page.properties) {
    for (const key of Object.keys(page.properties)) {
      const prop = page.properties[key];
      if (prop.type === 'title' && prop.title && prop.title.length > 0) {
        return prop.title.map(t => t.plain_text).join('');
      }
    }
  }
  return "Untitled Page";
}

// Helper: Fetch Notion pages and render them as live notes & tasks context
async function fetchLiveNotionContext() {
  try {
    console.log("[Notion] Fetching live pages from search...");
    const searchRes = await execSwytchcode('notion.search.create', {
      body: {
        page_size: 15
      }
    });

    const pages = searchRes && searchRes.results ? searchRes.results : [];
    console.log(`[Notion] Found ${pages.length} pages/databases.`);

    const clients = [];
    const projects = [];

    for (const page of pages) {
      if (page.object !== 'page') continue; // only process pages

      const pageId = page.id;
      const title = getPageTitle(page);
      
      console.log(`[Notion] Fetching markdown for page: "${title}" (${pageId})`);
      let markdown = "";
      try {
        const mdRes = await execSwytchcode('notion.markdown.get', {
          page_id: pageId,
          'Notion-Version': '2022-06-28'
        });
        markdown = mdRes && mdRes.markdown ? mdRes.markdown : "";
      } catch (mdErr) {
        console.warn(`[Notion Warn] Could not fetch markdown for page ${pageId}:`, mdErr.message || mdErr);
      }

      // Check if this page contains tasks (lines with "- [ ]")
      const tasks = [];
      const lines = markdown.split('\n');
      lines.forEach(line => {
        const match = line.match(/^[\s\t]*- \[\s\]\s*(.*)/);
        if (match) {
          tasks.push(match[1].trim());
        }
      });

      // Construct a "client" context representation for this page
      clients.push({
        id: `live_page_${pageId.replace(/-/g, '_')}`,
        name: title,
        priority: title.toLowerCase().includes('high') ? 'High' : 'Medium',
        notes: markdown.substring(0, 800) + (markdown.length > 800 ? '...' : ''),
        contactPerson: 'Notion Workspace',
        projects: tasks
      });

      // Map any checklist todo items to projects representing live tasks!
      tasks.forEach((task, idx) => {
        projects.push({
          id: `live_task_${pageId.replace(/-/g, '_')}_${idx}`,
          name: task,
          status: 'In Progress',
          dueDate: new Date().toISOString().split('T')[0], // Today
          summary: `Task from page "${title}": ${task}`
        });
      });
    }

    return {
      clients,
      projects,
      preferences: {
        briefingTime: "08:00 AM",
        focusAreas: clients.map(c => c.name)
      }
    };
  } catch (err) {
    console.error("[Notion Error] Failed to fetch live Notion context:", err);
    throw err;
  }
}

// 2. Demo / Mock Data (For offline sandbox or demo mode fallback)
const DEMO_GMAIL_DATA = [
  {
    id: "msg_abc_001",
    threadId: "thread_abc_001",
    snippet: "Hi, we reviewed the draft renewal contract you sent. The SLA terms on page 4 list 99.9% uptime, but our agreement requires 99.99%...",
    internalDate: Date.now() - 3600000, // 1 hour ago
    payload: {
      headers: [
        { name: "From", value: "Alice Smith <alice.smith@abccorp.com>" },
        { name: "Subject", value: "URGENT: Contract renewal SLA terms mismatch" },
        { name: "Date", value: new Date(Date.now() - 3600000).toUTCString() }
      ]
    }
  },
  {
    id: "msg_xyz_002",
    threadId: "thread_xyz_002",
    snippet: "Our development team is running into a recurring error: 'Rate limit exceeded' when connecting to the new GraphQL gateway...",
    internalDate: Date.now() - 7200000, // 2 hours ago
    payload: {
      headers: [
        { name: "From", value: "Bob Johnson <bob.johnson@xyztech.com>" },
        { name: "Subject", value: "API onboarding blocker - GraphQL gateway" },
        { name: "Date", value: new Date(Date.now() - 7200000).toUTCString() }
      ]
    }
  },
  {
    id: "msg_general_003",
    threadId: "thread_general_003",
    snippet: "Check out the top tech stories of the day, including new funding rounds for generative AI tools and startup highlights...",
    internalDate: Date.now() - 14400000, // 4 hours ago
    payload: {
      headers: [
        { name: "From", value: "TechCrunch Newsletter <news@techcrunch.com>" },
        { name: "Subject", value: "TechCrunch Daily: AI startup funding records" },
        { name: "Date", value: new Date(Date.now() - 14400000).toUTCString() }
      ]
    }
  }
];

const DEMO_CALENDAR_DATA = [
  {
    id: "cal_evt_001",
    summary: "Alignment Meeting: ABC Corp Contract Renewal",
    description: "Final alignment on Q3 deliverables and the upcoming contract renewal terms.",
    start: { dateTime: new Date(new Date().setHours(11, 0, 0, 0)).toISOString() },
    end: { dateTime: new Date(new Date().setHours(12, 0, 0, 0)).toISOString() },
    attendees: [
      { email: "alice.smith@abccorp.com" },
      { email: "user@example.com" }
    ]
  },
  {
    id: "cal_evt_002",
    summary: "Weekly Engineering Standup",
    description: "Catch-up on tasks, blockers, and sprint commitments.",
    start: { dateTime: new Date(new Date().setHours(9, 30, 0, 0)).toISOString() },
    end: { dateTime: new Date(new Date().setHours(10, 0, 0, 0)).toISOString() },
    attendees: [
      { email: "team@example.com" }
    ]
  },
  {
    id: "cal_evt_003",
    summary: "Internal Review: API gateway migration",
    description: "Double check rate limit thresholds and XYZ Tech integration.",
    start: { dateTime: new Date(new Date().setHours(11, 30, 0, 0)).toISOString() }, // Schedule conflict!
    end: { dateTime: new Date(new Date().setHours(12, 30, 0, 0)).toISOString() },
    attendees: [
      { email: "bob.johnson@xyztech.com" },
      { email: "user@example.com" }
    ]
  }
];

// Helper: Extract plain-text body from a real Gmail message payload (handles MIME multipart)
function extractEmailBody(payload) {
  if (!payload) return '';

  // Decode base64url to UTF-8 string
  const decodeBase64 = (data) => {
    try {
      return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    } catch (e) {
      return '';
    }
  };

  // Recursively search for text/plain or text/html parts
  const findTextPart = (part, preferMime) => {
    if (!part) return null;
    if (part.mimeType === preferMime && part.body && part.body.data) {
      return decodeBase64(part.body.data);
    }
    if (part.parts) {
      for (const subPart of part.parts) {
        const found = findTextPart(subPart, preferMime);
        if (found) return found;
      }
    }
    return null;
  };

  // Prefer plain text, fall back to HTML (strip tags)
  let body = findTextPart(payload, 'text/plain');
  if (!body) {
    const html = findTextPart(payload, 'text/html');
    if (html) {
      // Strip HTML tags for a readable snippet
      body = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  return (body || '').substring(0, 1000); // Cap at 1000 chars for analysis
}

// Helper: Local Semantic Reasoning Engine (fully data-driven, works with real emails)
function runLocalReasoning(emails, meetings, notion) {
  console.log("[AI Engine] Running Local Rule-Based Semantic Reasoning");
  const briefing = {
    executiveSummary: "",
    priorities: [],
    urgentEmails: [],
    todaySchedule: [],
    conflicts: [],
    notionContext: notion,
    recommendedActions: [],
    deadlines: []
  };

  // 1. Process Calendar Schedule
  meetings.forEach(evt => {
    briefing.todaySchedule.push({
      id: evt.id,
      summary: evt.summary || '(No title)',
      description: evt.description || "No description provided.",
      start: evt.start.dateTime || evt.start.date,
      end: evt.end.dateTime || evt.end.date,
      attendees: evt.attendees ? evt.attendees.map(a => a.email).join(', ') : 'None'
    });
  });

  // Sort schedule by start time
  briefing.todaySchedule.sort((a, b) => new Date(a.start) - new Date(b.start));

  // 2. Identify Schedule Conflicts
  for (let i = 0; i < briefing.todaySchedule.length; i++) {
    for (let j = i + 1; j < briefing.todaySchedule.length; j++) {
      const a = briefing.todaySchedule[i];
      const b = briefing.todaySchedule[j];
      const aStart = new Date(a.start);
      const aEnd = new Date(a.end);
      const bStart = new Date(b.start);
      const bEnd = new Date(b.end);
      if (aStart < bEnd && bStart < aEnd) {
        briefing.conflicts.push({
          event1: a.summary,
          event2: b.summary,
          timeRange: `${new Date(a.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(a.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} vs ${new Date(b.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(b.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          resolution: `Reschedule "${b.summary}" or shorten "${a.summary}" to resolve the overlap.`
        });
      }
    }
  }

  // 3. Process Emails — extract headers, snippet, body, urgency
  emails.forEach(msg => {
    if (!msg || !msg.payload || !msg.payload.headers) return;
    const headers = msg.payload.headers;
    const subject = (headers.find(h => h.name.toLowerCase() === 'subject')?.value) || 'No Subject';
    const from = (headers.find(h => h.name.toLowerCase() === 'from')?.value) || 'Unknown Sender';
    const to = (headers.find(h => h.name.toLowerCase() === 'to')?.value) || '';
    const date = msg.internalDate;

    // Use the snippet first; supplement with extracted body if available
    const bodyText = extractEmailBody(msg.payload);
    const analysisText = (msg.snippet || '') + ' ' + bodyText;

    const emailObj = {
      id: msg.id,
      threadId: msg.threadId,
      from,
      to,
      subject,
      snippet: msg.snippet || bodyText.substring(0, 200),
      labels: msg.labelIds || [],
      date: new Date(parseInt(date, 10)).toISOString(),
      isUrgent: false
    };

    // Urgency heuristic — keyword detection across subject + body
    const lowerSub = subject.toLowerCase();
    const lowerText = analysisText.toLowerCase();
    const urgencyKeywords = [
      'urgent', 'asap', 'blocker', 'action required', 'immediately',
      'critical', 'deadline', 'overdue', 'follow up', 'follow-up',
      'important', 'time sensitive', 'time-sensitive', 'priority'
    ];
    
    // Check if it is a newsletter, promotional, or spam email
    const isPromotionalOrSpam = 
      (msg.labelIds && msg.labelIds.some(l => 
        ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'SPAM', 'TRASH'].includes(l)
      )) ||
      lowerText.includes('unsubscribe') ||
      from.toLowerCase().includes('newsletter') ||
      from.toLowerCase().includes('promo') ||
      from.toLowerCase().includes('marketing') ||
      from.toLowerCase().includes('no-reply') ||
      from.toLowerCase().includes('noreply') ||
      from.toLowerCase().includes('notification') ||
      subject.toLowerCase().includes('unsubscribe');

    if (!isPromotionalOrSpam && urgencyKeywords.some(kw => lowerSub.includes(kw) || lowerText.includes(kw))) {
      emailObj.isUrgent = true;
      briefing.urgentEmails.push(emailObj);
    }
  });

  // 4. Cross-Source Priority Linking (Gmail + Calendar + Notion clients)
  const notionClients = (notion && notion.clients) ? notion.clients : [];
  notionClients.forEach(client => {
    const clientName = client.name.toLowerCase();

    const relatedEmails = emails.filter(msg => {
      if (!msg || !msg.payload || !msg.payload.headers) return false;
      const headers = msg.payload.headers;
      const sub = (headers.find(h => h.name.toLowerCase() === 'subject')?.value || '').toLowerCase();
      const from = (headers.find(h => h.name.toLowerCase() === 'from')?.value || '').toLowerCase();
      const body = (msg.snippet || '').toLowerCase();
      return from.includes(clientName) || sub.includes(clientName) || body.includes(clientName);
    });

    const relatedMeetings = meetings.filter(evt => {
      const summary = (evt.summary || '').toLowerCase();
      const desc = (evt.description || '').toLowerCase();
      const attendees = evt.attendees ? evt.attendees.map(a => a.email.toLowerCase()).join(' ') : '';
      return summary.includes(clientName) || desc.includes(clientName) || attendees.includes(clientName);
    });

    if (relatedEmails.length > 0 || relatedMeetings.length > 0) {
      const firstEmailSubject = relatedEmails.length > 0
        ? (relatedEmails[0].payload.headers.find(h => h.name.toLowerCase() === 'subject')?.value || null)
        : null;
      const firstMeetingSummary = relatedMeetings.length > 0 ? relatedMeetings[0].summary : null;

      // Build context-aware description from actual data
      const emailContext = relatedEmails.length > 0
        ? `You have ${relatedEmails.length} email(s) related to ${client.name} — latest: "${firstEmailSubject}".`
        : '';
      const meetingContext = relatedMeetings.length > 0
        ? `You have ${relatedMeetings.length} meeting(s) involving ${client.name} — next: "${firstMeetingSummary}".`
        : '';

      const priorityObj = {
        title: `${client.name}: ${firstEmailSubject || firstMeetingSummary || 'Active Item'}`,
        level: client.priority || 'Medium',
        notionContext: client.notes || '',
        relatedEmail: firstEmailSubject,
        relatedMeeting: firstMeetingSummary,
        description: [emailContext, meetingContext, client.notes ? `Notion context: ${client.notes}` : ''].filter(Boolean).join(' '),
        recommendedAction: `Review all ${client.name} communications and prepare context. Check if any reply or action is pending.`
      };

      // Add deadlines from Notion project data
      const relatedProjects = (notion.projects || []).filter(p =>
        (p.name || '').toLowerCase().includes(clientName) ||
        relatedEmails.some(e => (e.snippet || '').toLowerCase().includes((p.name || '').toLowerCase()))
      );
      relatedProjects.forEach(proj => {
        if (proj.dueDate) {
          briefing.deadlines.push({
            item: `${client.name}: ${proj.name}`,
            due: proj.dueDate
          });
          briefing.recommendedActions.push(`Review progress on "${proj.name}" for ${client.name} (due ${proj.dueDate}).`);
        }
      });

      briefing.priorities.push(priorityObj);
    }
  });

  // 5. Surface urgent emails not tied to any Notion client as standalone priorities
  briefing.urgentEmails.forEach(emailObj => {
    const alreadyLinked = briefing.priorities.some(p => p.relatedEmail === emailObj.subject);
    if (!alreadyLinked) {
      briefing.priorities.push({
        title: `Urgent: ${emailObj.subject}`,
        level: 'High',
        notionContext: '',
        relatedEmail: emailObj.subject,
        relatedMeeting: null,
        description: `Urgent email from ${emailObj.from}: ${emailObj.snippet}`,
        recommendedAction: `Review and respond to the urgent email from ${emailObj.from} as soon as possible.`
      });
      briefing.recommendedActions.push(`Respond to urgent email: "${emailObj.subject}" from ${emailObj.from}.`);
    }
  });

  // 5b. Surface important/urgent meetings as standalone priorities
  meetings.forEach(evt => {
    const summary = evt.summary || '';
    const description = evt.description || '';
    const lowerSub = summary.toLowerCase();
    const lowerDesc = description.toLowerCase();
    const importanceKeywords = [
      'urgent', 'asap', 'blocker', 'action required', 'immediately',
      'critical', 'deadline', 'overdue', 'important', 'priority', 'key'
    ];
    if (importanceKeywords.some(kw => lowerSub.includes(kw) || lowerDesc.includes(kw))) {
      const alreadyLinked = briefing.priorities.some(p => p.relatedMeeting === summary);
      if (!alreadyLinked) {
        // Determine severity level
        const isHighSeverity = ['urgent', 'asap', 'blocker', 'immediately', 'critical'].some(kw => 
          lowerSub.includes(kw) || lowerDesc.includes(kw)
        );
        briefing.priorities.push({
          title: `Priority Meeting: ${summary}`,
          level: isHighSeverity ? 'High' : 'Medium',
          notionContext: '',
          relatedEmail: null,
          relatedMeeting: summary,
          description: `Scheduled calendar event. Description: "${description || 'No description provided.'}"`,
          recommendedAction: `Prepare notes and review agenda for "${summary}".`
        });
        briefing.recommendedActions.push(`Attend important meeting: "${summary}".`);
      }
    }
  });

  // Sort priorities (High first)
  briefing.priorities.sort((a, b) => {
    const levels = { 'High': 3, 'Medium': 2, 'Low': 1 };
    return (levels[b.level] || 0) - (levels[a.level] || 0);
  });

  // 6. Generate Executive Summary dynamically from real data
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const totalEmails = emails.length;
  const urgentCount = briefing.urgentEmails.length;
  const meetingCount = briefing.todaySchedule.length;
  const conflictCount = briefing.conflicts.length;
  const priorityCount = briefing.priorities.length;

  const summaryParts = [
    `Good morning. Today is ${today}.`,
    totalEmails > 0 ? `Your inbox has ${totalEmails} recent message(s)${urgentCount > 0 ? `, including ${urgentCount} marked urgent` : ''}.` : 'Your inbox is quiet.',
    meetingCount > 0 ? `You have ${meetingCount} meeting(s) on your calendar today.` : 'No meetings scheduled today.',
    conflictCount > 0 ? `⚠️ ${conflictCount} schedule conflict(s) detected — review your calendar.` : '',
    priorityCount > 0 ? `${priorityCount} priority item(s) identified across your email, calendar, and notes.` : 'No cross-source priorities identified.',
  ].filter(Boolean);

  briefing.executiveSummary = summaryParts.join(' ');

  return briefing;
}

// Helper: Call Gemini API using built-in https
function callGeminiReasoning(apiKey, emails, meetings, notion) {
  return new Promise((resolve, reject) => {
    const systemInstruction = `You are a professional AI Chief of Staff. Your job is to read Gmail messages, Calendar meetings, and Notion context databases, and generate a unified, highly intelligent executive briefing. 
    You must output a single JSON object. Do NOT wrap it in markdown code fences (\`\`\`json). Output raw JSON.
    The JSON structure must exactly match:
    {
      "executiveSummary": "...",
      "priorities": [
        {
          "title": "...",
          "level": "High|Medium|Low",
          "notionContext": "...",
          "relatedEmail": "...",
          "relatedMeeting": "...",
          "description": "...",
          "recommendedAction": "..."
        }
      ],
      "urgentEmails": [
        {
          "id": "...",
          "from": "...",
          "subject": "...",
          "snippet": "...",
          "date": "...",
          "isUrgent": true
        }
      ],
      "todaySchedule": [
        {
          "id": "...",
          "summary": "...",
          "description": "...",
          "start": "...",
          "end": "...",
          "attendees": "..."
        }
      ],
      "conflicts": [
        {
          "event1": "...",
          "event2": "...",
          "timeRange": "...",
          "resolution": "..."
        }
      ],
      "recommendedActions": ["...", "..."],
      "deadlines": [
        {
          "item": "...",
          "due": "..."
        }
      ]
    }`;

    const promptText = `
    Input Data:
    
    1. Gmail Messages:
    ${JSON.stringify(emails, null, 2)}
    
    2. Google Calendar Meetings:
    ${JSON.stringify(meetings, null, 2)}
    
    3. Notion Context:
    ${JSON.stringify(notion, null, 2)}
    
    Join the data across sources using semantic relations (names, clients, projects, topics). Formulate the briefing details and return the JSON object.`;

    const requestData = JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: promptText }]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => {
        responseBody += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(responseBody);
            const textResponse = parsed.candidates[0].content.parts[0].text;
            resolve(JSON.parse(textResponse));
          } catch (e) {
            reject(new Error('Failed to parse Gemini response: ' + e.message + '\nRaw: ' + responseBody));
          }
        } else {
          reject(new Error(`Gemini API Error (status ${res.statusCode}): ` + responseBody));
        }
      });
    });

    req.on('error', e => {
      reject(e);
    });

    req.write(requestData);
    req.end();
  });
}

// 3. Main HTTP Server
const server = http.createServer(async (req, res) => {
  const url = req.url;
  const method = req.method;

  console.log(`[Request] ${method} ${url}`);

  // Static File Routing — serve anything from public/
  if (method === 'GET' && !url.startsWith('/api/')) {
    // Normalise: strip query strings, default to /index.html
    let filePath = url.split('?')[0];
    if (filePath === '/') filePath = '/index.html';
    const fullPath = path.join(__dirname, 'public', filePath);
    // Security: prevent directory traversal
    if (!fullPath.startsWith(path.join(__dirname, 'public'))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('Forbidden');
    }
    serveStaticFile(res, fullPath);
  }

  // API: Get Daily Briefing
  else if (method === 'GET' && url.startsWith('/api/briefing')) {
    try {
      let emails = [];
      let meetings = [];
      let notion = {};

      // A. Load Notion context (from local JSON file or Live API)
      if (DEMO_MODE) {
        console.log("[Server] Serving Demo Notion Context");
        const notionPath = path.join(__dirname, 'data', 'notion_context.json');
        if (fs.existsSync(notionPath)) {
          notion = JSON.parse(fs.readFileSync(notionPath, 'utf8'));
        } else {
          notion = { clients: [], projects: [], preferences: {} };
        }
      } else {
        try {
          console.log("[Server] Loading live Notion context via Swytchcode...");
          notion = await fetchLiveNotionContext();
          console.log(`[Server] Live Notion context loaded: ${notion.clients.length} clients/pages, ${notion.projects.length} tasks/projects.`);
        } catch (notionErr) {
          console.error("[Notion Live Load Failed] Falling back to local notion_context.json:", notionErr.message || notionErr);
          const notionPath = path.join(__dirname, 'data', 'notion_context.json');
          if (fs.existsSync(notionPath)) {
            notion = JSON.parse(fs.readFileSync(notionPath, 'utf8'));
          } else {
            notion = { clients: [], projects: [], preferences: {} };
          }
        }
      }

      // B. Retrieve Gmail and Calendar data (Demo vs Live Swytchcode)
      if (DEMO_MODE) {
        console.log("[Server] Serving Demo Data");
        emails = DEMO_GMAIL_DATA;
        meetings = DEMO_CALENDAR_DATA;
      } else {
        console.log("[Server] Invoking Swytchcode CLI Subprocesses");
        
        // 1. Fetch Gmail messages — list first, then fetch each with full format
        try {
          const listRes = await execSwytchcode('gmail.user.messages.get', {
            userId: 'me',
            maxResults: 15,
            q: 'is:inbox'
          });
          if (listRes && listRes.messages && listRes.messages.length > 0) {
            console.log(`[Gmail] Found ${listRes.messages.length} messages. Fetching full details...`);
            const detailedEmails = [];
            for (const msg of listRes.messages) {
              try {
                // format=full returns complete payload including body parts
                const details = await execSwytchcode('gmail.user.messages.get1', {
                  userId: 'me',
                  id: msg.id,
                  format: 'full'
                });
                if (details && details.payload) detailedEmails.push(details);
              } catch (msgErr) {
                console.warn(`[Gmail Warn] Could not fetch message ${msg.id}:`, msgErr.error || msgErr);
              }
            }
            console.log(`[Gmail] Successfully fetched ${detailedEmails.length} full messages.`);
            emails = detailedEmails;
          } else {
            console.log('[Gmail] Inbox is empty or no messages returned.');
            emails = [];
          }
        } catch (swError) {
          console.error("[Gmail Swytchcode Execution Failed] Falling back to Demo Gmail Data:", swError);
          // Auto fallback to demo gmail data if Gmail Swytchcode calls fail
          emails = DEMO_GMAIL_DATA;
        }

        // 2. Fetch Google Calendar events
        try {
          const timeMin = new Date();
          timeMin.setHours(0, 0, 0, 0);
          const calRes = await execSwytchcode('calendar.event.get', {
            calendarId: 'primary',
            timeMin: timeMin.toISOString(),
            singleEvents: true,
            orderBy: 'startTime'
          });
          meetings = calRes && calRes.items ? calRes.items : [];
          console.log(`[Calendar] Successfully fetched ${meetings.length} meetings.`);
        } catch (swError) {
          console.error("[Calendar Swytchcode Execution Failed] Falling back to Demo Calendar Data:", swError);
          // Auto fallback to demo calendar data if Calendar Swytchcode calls fail
          meetings = DEMO_CALENDAR_DATA;
        }
      }

      // C. Run AI Reasoning
      let briefingResult;
      if (GEMINI_API_KEY) {
        try {
          briefingResult = await callGeminiReasoning(GEMINI_API_KEY, emails, meetings, notion);
        } catch (gemError) {
          console.error("[Gemini Reasoning Failed] Falling back to local rule reasoning:", gemError);
          briefingResult = runLocalReasoning(emails, meetings, notion);
        }
      } else {
        briefingResult = runLocalReasoning(emails, meetings, notion);
      }

      // Query Notion to pre-populate user's real email address if possible
      let userEmail = '';
      if (!DEMO_MODE) {
        try {
          const botUser = await execSwytchcode('notion.me.list', {});
          if (botUser && botUser.bot && botUser.bot.owner && botUser.bot.owner.person) {
            userEmail = botUser.bot.owner.person.email || '';
          }
        } catch (emailFetchErr) {
          // Ignore and default to empty
        }
      }
      briefingResult.userEmail = userEmail;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(briefingResult));
    } catch (err) {
      console.error("[API Error] Failed to generate briefing:", err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Internal server error' }));
    }
  }

  // API: Send Briefing Email (uses Gmail send)
  else if (method === 'POST' && url === '/api/send-email') {
    try {
      const body = await parseJsonBody(req);
      const { recipient, briefingHtml } = body;

      if (!recipient || !briefingHtml) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'recipient and briefingHtml are required fields' }));
        return;
      }

      if (RESEND_API_KEY) {
        console.log(`[Server] Sending email to ${recipient} via Swytchcode Resend`);
        // Use resend.email.create
        // Returns: { id: string }
        const sendArgs = {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          body: {
            from: 'onboarding@resend.dev', // Resend default domain sender for sandbox/onboarding
            to: recipient,
            subject: 'Daily Executive Assistant Briefing',
            html: briefingHtml
          }
        };
        const result = await execSwytchcode('resend.email.create', sendArgs);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Email sent successfully via Resend API', detail: result }));
      } else if (DEMO_MODE) {
        console.log(`[Demo] Simulating sending briefing email to ${recipient}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `[DEMO] Briefing successfully emailed to ${recipient}` }));
      } else {
        console.log(`[Server] Sending email to ${recipient} via Swytchcode Gmail`);

          // Assemble raw RFC 2822 email payload
          const emailLines = [
            `To: ${recipient}`,
            `Subject: Daily Executive Assistant Briefing`,
            `Content-Type: text/html; charset=utf-8`,
            `MIME-Version: 1.0`,
            ``,
            briefingHtml
          ].join('\r\n');

          // Base64url encode
          const rawBase64 = Buffer.from(emailLines)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

          // Call Gmail API send message
          const sendArgs = {
            userId: 'me',
            headers: {
              "Content-Type": "application/json"
            },
            body: {
              raw: rawBase64
            }
          };

          const result = await execSwytchcode('gmail.user.send.create1', sendArgs);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Email sent successfully via Gmail API', detail: result }));
        }
    } catch (err) {
      console.error("[API Error] Failed to send email:", err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Failed to send email' }));
    }
  }

  // POST /api/* routes that don't match return 404

});

// Start Server
server.listen(PORT, '127.0.0.1', () => {
  console.log(`==================================================`);
  console.log(` ✨ Aegis AI Executive Assistant`);
  console.log(` 🚀 Running at: http://localhost:${PORT}`);
  console.log(` 🎯 Mode: ${DEMO_MODE ? 'DEMO (offline)' : 'LIVE (Swytchcode)'}`);
  console.log(` 🤖 AI Engine: ${GEMINI_API_KEY ? 'Gemini 1.5 Flash' : 'Local Semantic Reasoner'}`);
  console.log(`==================================================`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' || err.code === 'EPERM') {
    console.error(`\n❌ Cannot bind to port ${PORT}.`);
    console.error(`   Try a different port: PORT=3001 node server.js`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
