# System Architecture
# AI Executive Assistant

## 1. Architecture Goal

The architecture should remain simple, modular, understandable, and suitable for a hackathon.

The system should separate:

1. User interface
2. Application/backend logic
3. External integrations
4. AI reasoning
5. Output/delivery

---

# 2. High-Level Architecture

                    USER
                     |
                     v
               WEB DASHBOARD
                     |
                     v
             APPLICATION SERVER
                     |
          +----------+----------+
          |          |          |
          v          v          v
       GMAIL     CALENDAR     NOTION
          |          |          |
          +----------+----------+
                     |
                     v
              NORMALIZED DATA
                     |
                     v
                AI AGENT
                     |
          +----------+----------+
          |          |          |
          v          v          v
      PRIORITIES  CONFLICTS  ACTIONS
          |          |          |
          +----------+----------+
                     |
                     v
             EXECUTIVE BRIEFING
                     |
              +------+------+
              |             |
              v             v
         DASHBOARD       RESEND
                            |
                            v
                       USER EMAIL

---

# 3. Frontend

The frontend is responsible for:

- Displaying the dashboard.
- Allowing the user to generate a briefing.
- Showing loading states.
- Showing errors.
- Displaying priorities.
- Displaying important emails.
- Displaying today's schedule.
- Displaying conflicts.
- Displaying recommendations.
- Allowing the user to send the briefing by email.

The frontend should not contain secret credentials.

External service authentication and sensitive operations should remain on the appropriate backend/server side or through the connected Swytchcode capabilities.

---

# 4. Backend / Application Layer

The backend/application layer coordinates the workflow.

Its responsibilities include:

- Calling available integrations.
- Collecting source data.
- Normalizing source data.
- Passing relevant information to the AI.
- Receiving structured AI output.
- Returning the result to the frontend.
- Triggering email delivery when requested.

The backend should not contain unnecessary business logic that belongs to the AI reasoning layer.

---

# 5. Integration Layer

Each external source should be treated as a separate capability.

Conceptually:

Gmail Adapter
Calendar Adapter
Notion Adapter
Email/Resend Adapter

The exact implementation must depend on the actual Swytchcode capabilities available in the Antigravity environment.

Do NOT invent APIs.

Do NOT assume package names.

Do NOT assume authentication flows.

Inspect the connected Swytchcode capabilities before implementation.

---

# 6. Gmail Data Flow

Gmail:

External Gmail data
        ↓
Swytchcode capability
        ↓
Application
        ↓
Relevant email information
        ↓
Normalized representation
        ↓
AI Agent

The application should retrieve only the information required for the current briefing whenever practical.

---

# 7. Calendar Data Flow

Calendar:

Google Calendar
        ↓
Swytchcode capability
        ↓
Application
        ↓
Today's relevant events
        ↓
Normalized representation
        ↓
AI Agent

---

# 8. Notion Data Flow

Notion:

Notion workspace
        ↓
Swytchcode capability
        ↓
Application
        ↓
Relevant context
        ↓
Normalized representation
        ↓
AI Agent

---

# 9. Normalized Data

The AI should ideally receive structured information rather than raw unstructured integration responses.

Conceptually:

{
  "emails": [],
  "calendarEvents": [],
  "notionContext": []
}

The exact schema should be designed during implementation.

The schema should preserve enough information for reasoning while avoiding unnecessary data.

---

# 10. AI Reasoning Layer

The AI reasoning layer should:

1. Read the normalized information.
2. Identify important entities.
3. Identify relationships between sources.
4. Identify urgency.
5. Identify importance.
6. Identify potential conflicts.
7. Identify deadlines.
8. Rank priorities.
9. Generate recommendations.
10. Generate the final briefing.

The reasoning should be deterministic in structure even though natural-language generation may vary.

---

# 11. Cross-Source Correlation

The most important intelligence in the system is cross-source correlation.

Example:

Gmail:
Client asks for contract update.

Calendar:
Meeting with same client at 2 PM.

Notion:
Client is high priority.

The AI should connect these.

The system should not treat them as three unrelated facts.

---

# 12. AI Output Schema

Prefer structured output conceptually similar to:

{
  "summary": "...",
  "priorities": [
    {
      "title": "...",
      "reason": "...",
      "recommendedAction": "...",
      "urgency": "high"
    }
  ],
  "urgentEmails": [],
  "calendarEvents": [],
  "conflicts": [],
  "deadlines": [],
  "recommendations": []
}

The exact implementation may differ.

The UI should consume structured data rather than attempting to parse a large block of AI-generated text.

---

# 13. Email Flow

When the user clicks "Send Briefing":

Dashboard
    ↓
Application
    ↓
Generated briefing
    ↓
Email capability / Resend
    ↓
Configured recipient
    ↓
Email inbox

The recipient should be explicitly configured.

Never guess the recipient.

---

# 14. Security

Sensitive credentials must never be exposed in frontend code.

API keys, secrets, tokens, and integration credentials must be stored using the appropriate environment/configuration mechanism.

Do not commit secrets to Git.

Do not print secrets into logs.

---

# 15. Error Handling

Each integration can fail independently.

Examples:

- Gmail unavailable
- Calendar unavailable
- Notion unavailable
- AI generation fails
- Email sending fails

The application should not crash completely because one source failed.

Example:

If Notion is unavailable:

"Gmail and Calendar data were retrieved successfully. Notion context could not be loaded."

The AI should not pretend it received information that it did not receive.

---

# 16. Architecture Principle

The application should optimize for:

Working end-to-end demo
>
Simplicity
>
Reliability
>
Maintainability
>
Extra features

Do not introduce complexity without a clear product reason.