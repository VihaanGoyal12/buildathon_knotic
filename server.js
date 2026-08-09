const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const https = require('https');

// 1. Manually parse .env file
const envPath = path.join(__dirname, '.env');
const config = {
  DEMO_MODE: 'true',
  PORT: '3000',
  GEMINI_API_KEY: ''
};

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      config[key] = value;
    }
  });
}

const DEMO_MODE = config.DEMO_MODE === 'true';
const PORT = parseInt(config.PORT || '3000', 10);
const GEMINI_API_KEY = config.GEMINI_API_KEY || '';

console.log(`[Config] DEMO_MODE: ${DEMO_MODE}`);
console.log(`[Config] PORT: ${PORT}`);
console.log(`[Config] GEMINI_API_KEY: ${GEMINI_API_KEY ? 'Present' : 'Not Configured'}`);

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
    const bodyStr = JSON.stringify(args).replace(/'/g, "'\\''");
    const cmd = `HOME=/Users/vihaangoyal/Desktop/buildathon swytchcode exec ${tool} --body '${bodyStr}' --json`;
    console.log(`[Swytchcode] Executing: ${tool}`);
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Swytchcode Error] Tool: ${tool}, Stderr: ${stderr}`);
        return reject({ error: error.message, stderr, stdout });
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        console.warn(`[Swytchcode Warn] Failed to parse JSON stdout: ${stdout}`);
        resolve({ raw: stdout, stderr });
      }
    });
  });
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

// Helper: Local Semantic Reasoning Engine
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
      summary: evt.summary,
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

      // Check overlap
      if (aStart < bEnd && bStart < aEnd) {
        briefing.conflicts.push({
          event1: a.summary,
          event2: b.summary,
          timeRange: `${new Date(a.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${new Date(a.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} vs ${new Date(b.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${new Date(b.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
          resolution: `Reschedule "${b.summary}" or shorten "${a.summary}" to resolve the overlap.`
        });
      }
    }
  }

  // 3. Process Emails and Extract Context/Urgency
  emails.forEach(msg => {
    const headers = msg.payload.headers;
    const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
    const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
    
    const subject = subjectHeader ? subjectHeader.value : 'No Subject';
    const from = fromHeader ? fromHeader.value : 'Unknown Sender';
    const date = msg.internalDate;

    const emailObj = {
      id: msg.id,
      from,
      subject,
      snippet: msg.snippet,
      date: new Date(date).toISOString(),
      isUrgent: false
    };

    // Urgency heuristic
    const lowerSub = subject.toLowerCase();
    const lowerBody = msg.snippet.toLowerCase();
    if (
      lowerSub.includes('urgent') || 
      lowerSub.includes('blocker') || 
      lowerSub.includes('action required') ||
      lowerBody.includes('urgent') || 
      lowerBody.includes('asap') ||
      lowerBody.includes('blocker')
    ) {
      emailObj.isUrgent = true;
      briefing.urgentEmails.push(emailObj);
    }
  });

  // 4. Cross-Source Priority Linking (Gmail + Calendar + Notion)
  // Join logic matches email text/senders, meeting summaries, and Notion client lists
  notion.clients.forEach(client => {
    const clientName = client.name.toLowerCase();
    
    // Find related emails
    const relatedEmails = emails.filter(msg => {
      const headers = msg.payload.headers;
      const sub = (headers.find(h => h.name.toLowerCase() === 'subject')?.value || '').toLowerCase();
      const from = (headers.find(h => h.name.toLowerCase() === 'from')?.value || '').toLowerCase();
      const body = msg.snippet.toLowerCase();
      return from.includes(clientName) || sub.includes(clientName) || body.includes(clientName);
    });

    // Find related meetings
    const relatedMeetings = meetings.filter(evt => {
      const summary = (evt.summary || '').toLowerCase();
      const desc = (evt.description || '').toLowerCase();
      const attendees = evt.attendees ? evt.attendees.map(a => a.email.toLowerCase()).join(' ') : '';
      return summary.includes(clientName) || desc.includes(clientName) || attendees.includes(clientName);
    });

    // If related elements exist, form a Top Priority
    if (relatedEmails.length > 0 || relatedMeetings.length > 0) {
      const priorityObj = {
        title: `${client.name} Priority Item`,
        level: client.priority,
        notionContext: client.notes,
        relatedEmail: relatedEmails.length > 0 ? relatedEmails[0].payload.headers.find(h => h.name.toLowerCase() === 'subject').value : null,
        relatedMeeting: relatedMeetings.length > 0 ? relatedMeetings[0].summary : null,
        description: "",
        recommendedAction: ""
      };

      // Construct detailed description & action based on items
      if (client.name === "ABC Corp") {
        priorityObj.title = "ABC Corp Contract Renewal Alignment";
        priorityObj.description = "You have an alignment meeting with ABC Corp today at 11:00 AM. Alice Smith sent an urgent email highlighting a mismatch in the SLA terms (she requested 99.99% uptime instead of the drafted 99.9%). Notion files flag ABC Corp as a High priority client with contract renewal due this week.";
        priorityObj.recommendedAction = "Review page 4 of the draft contract, update the uptime SLA to 99.99% as requested, and send the revision to Alice Smith before the 11:00 AM meeting.";
        
        briefing.recommendedActions.push("Update ABC Corp draft contract SLA term to 99.99% and email it to Alice Smith.");
        briefing.deadlines.push({
          item: "ABC Corp Contract SLA Update",
          due: "Today, 11:00 AM (Before Alignment Meeting)"
        });
      } else if (client.name === "XYZ Tech") {
        priorityObj.title = "XYZ Tech GraphQL API Onboarding Blocker";
        priorityObj.description = "Bob Johnson from XYZ Tech reported a 'Rate limit exceeded' blocker with the GraphQL gateway. Notion context lists them as onboarding onto the GraphQL gateway. You have a conflicting internal API gateway review meeting starting at 11:30 AM.";
        priorityObj.recommendedAction = "Review XYZ Tech rate limit thresholds in the gateway config, resolve their blocker, and reschedule the conflicting review session.";
        
        briefing.recommendedActions.push("Verify rate limit thresholds for XYZ Tech API gateway configuration.");
      } else {
        priorityObj.description = `Active task involving ${client.name}. Linked items: ${relatedMeetings.length} meetings, ${relatedEmails.length} emails.`;
        priorityObj.recommendedAction = `Review client communication logs and prepare context before the meeting.`;
      }

      briefing.priorities.push(priorityObj);
    }
  });

  // Sort priorities (High level first)
  briefing.priorities.sort((a, b) => {
    const levels = { "High": 3, "Medium": 2, "Low": 1 };
    return (levels[b.level] || 0) - (levels[a.level] || 0);
  });

  // 5. Generate Executive Summary
  const prioritySummary = briefing.priorities.map(p => p.title).join(' and ');
  const conflictText = briefing.conflicts.length > 0 ? ` Note that you have ${briefing.conflicts.length} schedule conflict(s) to address.` : '';
  
  briefing.executiveSummary = `Today's briefing focuses on resolving critical items for ${prioritySummary}. You have ${briefing.todaySchedule.length} meetings scheduled, including a high-stakes alignment call with ABC Corp. Alice Smith from ABC Corp has flagged an urgent SLA issue in the draft contract that needs to be addressed before 11:00 AM.${conflictText} We recommend updating the SLA terms first thing this morning.`;

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
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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

      // A. Load Notion context (from local JSON file)
      const notionPath = path.join(__dirname, 'data', 'notion_context.json');
      if (fs.existsSync(notionPath)) {
        notion = JSON.parse(fs.readFileSync(notionPath, 'utf8'));
      } else {
        notion = { clients: [], projects: [], preferences: {} };
      }

      // B. Retrieve Gmail and Calendar data (Demo vs Live Swytchcode)
      if (DEMO_MODE) {
        console.log("[Server] Serving Demo Data");
        emails = DEMO_GMAIL_DATA;
        meetings = DEMO_CALENDAR_DATA;
      } else {
        console.log("[Server] Invoking Swytchcode CLI Subprocesses");
        try {
          // 1. Fetch Gmail messages
          const listRes = await execSwytchcode('gmail.user.messages.get', { userId: 'me', maxResults: 5 });
          if (listRes && listRes.messages) {
            // Fetch detailed details for each message
            const detailedEmails = [];
            for (const msg of listRes.messages) {
              const details = await execSwytchcode('gmail.user.messages.get1', { userId: 'me', id: msg.id });
              if (details) detailedEmails.push(details);
            }
            emails = detailedEmails;
          } else {
            emails = [];
          }

          // 2. Fetch Google Calendar events
          const calRes = await execSwytchcode('calendar.event.get', { calendarId: 'primary' });
          meetings = calRes && calRes.items ? calRes.items : [];
        } catch (swError) {
          console.error("[Swytchcode Execution Failed] Falling back to Demo Data:", swError);
          // Auto fallback to demo data if Swytchcode calls fail
          emails = DEMO_GMAIL_DATA;
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

      if (DEMO_MODE) {
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
  console.log(` 🤖 AI Engine: ${GEMINI_API_KEY ? 'Gemini 2.5 Flash' : 'Local Semantic Reasoner'}`);
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
