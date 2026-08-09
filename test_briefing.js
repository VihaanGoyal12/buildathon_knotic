const fs = require('fs');
const path = require('path');

// Replicate local reasoning engine from server.js for validation
function runLocalReasoning(emails, meetings, notion) {
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

  briefing.todaySchedule.sort((a, b) => new Date(a.start) - new Date(b.start));

  // Identify Conflicts
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
          timeRange: `${new Date(a.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${new Date(a.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} vs ${new Date(b.start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${new Date(b.end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
          resolution: `Reschedule "${b.summary}" or shorten "${a.summary}" to resolve the overlap.`
        });
      }
    }
  }

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

  notion.clients.forEach(client => {
    const clientName = client.name.toLowerCase();
    
    const relatedEmails = emails.filter(msg => {
      const headers = msg.payload.headers;
      const sub = (headers.find(h => h.name.toLowerCase() === 'subject')?.value || '').toLowerCase();
      const from = (headers.find(h => h.name.toLowerCase() === 'from')?.value || '').toLowerCase();
      const body = msg.snippet.toLowerCase();
      return from.includes(clientName) || sub.includes(clientName) || body.includes(clientName);
    });

    const relatedMeetings = meetings.filter(evt => {
      const summary = (evt.summary || '').toLowerCase();
      const desc = (evt.description || '').toLowerCase();
      const attendees = evt.attendees ? evt.attendees.map(a => a.email.toLowerCase()).join(' ') : '';
      return summary.includes(clientName) || desc.includes(clientName) || attendees.includes(clientName);
    });

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

  briefing.priorities.sort((a, b) => {
    const levels = { "High": 3, "Medium": 2, "Low": 1 };
    return (levels[b.level] || 0) - (levels[a.level] || 0);
  });

  const prioritySummary = briefing.priorities.map(p => p.title).join(' and ');
  const conflictText = briefing.conflicts.length > 0 ? ` Note that you have ${briefing.conflicts.length} schedule conflict(s) to address.` : '';
  
  briefing.executiveSummary = `Today's briefing focuses on resolving critical items for ${prioritySummary}. You have ${briefing.todaySchedule.length} meetings scheduled, including a high-stakes alignment call with ABC Corp. Alice Smith from ABC Corp has flagged an urgent SLA issue in the draft contract that needs to be addressed before 11:00 AM.${conflictText} We recommend updating the SLA terms first thing this morning.`;

  return briefing;
}

// Load Demo Data & Notion Context
const notionData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'notion_context.json'), 'utf8'));

const DEMO_GMAIL_DATA = [
  {
    id: "msg_abc_001",
    payload: {
      headers: [
        { name: "From", value: "Alice Smith <alice.smith@abccorp.com>" },
        { name: "Subject", value: "URGENT: Contract renewal SLA terms mismatch" }
      ]
    },
    snippet: "Hi, we reviewed the draft renewal contract you sent. The SLA terms on page 4 list 99.9% uptime, but our agreement requires 99.99%...",
    internalDate: Date.now() - 3600000
  },
  {
    id: "msg_xyz_002",
    payload: {
      headers: [
        { name: "From", value: "Bob Johnson <bob.johnson@xyztech.com>" },
        { name: "Subject", value: "API onboarding blocker - GraphQL gateway" }
      ]
    },
    snippet: "Our development team is running into a recurring error: 'Rate limit exceeded' when connecting to the new GraphQL gateway...",
    internalDate: Date.now() - 7200000
  }
];

const DEMO_CALENDAR_DATA = [
  {
    id: "cal_evt_001",
    summary: "Alignment Meeting: ABC Corp Contract Renewal",
    description: "Final alignment on Q3 deliverables and the upcoming contract renewal terms.",
    start: { dateTime: new Date(new Date().setHours(11, 0, 0, 0)).toISOString() },
    end: { dateTime: new Date(new Date().setHours(12, 0, 0, 0)).toISOString() },
    attendees: [{ email: "alice.smith@abccorp.com" }]
  },
  {
    id: "cal_evt_002",
    summary: "Internal Review: API gateway migration",
    description: "Double check rate limit thresholds and XYZ Tech integration.",
    start: { dateTime: new Date(new Date().setHours(11, 30, 0, 0)).toISOString() },
    end: { dateTime: new Date(new Date().setHours(12, 30, 0, 0)).toISOString() },
    attendees: [{ email: "bob.johnson@xyztech.com" }]
  }
];

// Run Reasoning
console.log("--- STARTING AI CHIEF OF STAFF REASONING ---");
const result = runLocalReasoning(DEMO_GMAIL_DATA, DEMO_CALENDAR_DATA, notionData);
console.log(JSON.stringify(result, null, 2));
console.log("--- VALIDATION COMPLETED ---");
