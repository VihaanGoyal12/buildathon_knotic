# Project Rules
# AI Executive Assistant

These rules apply to every implementation task.

---

# 1. Do Not Invent Integrations

Never invent:

- Swytchcode APIs
- SDK methods
- API endpoints
- Authentication methods
- Environment variables
- Package names
- Tool names

If a capability is required, inspect the actual connected environment first.

---

# 2. Swytchcode First

Swytchcode is already connected to the development environment.

If an existing Swytchcode capability provides a required integration, prefer using it over manually recreating the integration.

Do not install another service just because it is familiar.

---

# 3. Do Not Over-Engineer

This is a hackathon project.

Do not introduce:

- Microservices
- Complex databases
- Kubernetes
- Complex authentication
- Unnecessary queues
- Unnecessary caching
- Unnecessary infrastructure

unless there is a clear requirement.

---

# 4. Do Not Break Existing Work

Before changing files:

- Inspect the existing code.
- Understand the current architecture.
- Preserve working functionality.
- Avoid unnecessary rewrites.

---

# 5. No Fake Functionality

Do not create fake integrations that pretend to retrieve real Gmail, Calendar, or Notion information unless a temporary mock is explicitly requested for development/testing.

A button that appears to work but does not actually perform the intended operation is not considered complete.

---

# 6. No Hardcoded AI Conclusions

Do not hardcode:

"ABC Corp is the highest priority."

ABC Corp is only an example.

The application must derive priorities from actual available data.

---

# 7. No Hallucinated Facts

The AI must distinguish between:

- Retrieved facts
- Reasonable recommendations
- Missing information

Never invent:

- Emails
- Meetings
- Clients
- Deadlines
- Requirements
- Priorities
- People
- Business facts

If the source does not contain the information, say that the information is unavailable.

---

# 8. Cross-Source Reasoning Is Required

The system should not simply display:

Gmail data
+
Calendar data
+
Notion data

The AI should identify meaningful relationships between them.

---

# 9. Dashboard Is Primary

The dashboard is the main user experience.

Email is secondary.

Resend should not become the central feature of the product.

---

# 10. Resend Is an Action

Resend is used to deliver the generated briefing by email.

Resend does not:

- Analyze emails
- Reason about priorities
- Read Notion
- Read Calendar
- Decide priorities

It only handles email delivery.

---

# 11. Keep Secrets Secure

Never put secret API keys in:

- React/client-side code
- Public files
- Git commits
- Screenshots
- Documentation

Use appropriate environment configuration.

---

# 12. Explain Important Decisions

When making a major architectural decision, document:

- What was changed
- Why it was changed
- What dependency it creates
- Whether it can be reverted

---

# 13. Test After Meaningful Changes

After implementing a meaningful feature:

1. Run the application.
2. Check the feature.
3. Check browser console.
4. Check server logs where applicable.
5. Fix errors before moving on.

---

# 14. Do Not Change Multiple Major Areas at Once

Prefer:

One integration
→ test

Then:

Next integration
→ test

Then:

AI reasoning
→ test

Then:

Dashboard
→ test

Then:

Email
→ test

---

# 15. User Experience Rule

The user should understand the result quickly.

Do not overwhelm the dashboard with raw API responses.

Show:

- Important information
- Why it matters
- Recommended action

Details can be expandable.

---

# 16. Demo Reliability

The application must have a predictable demo flow.

Avoid features that are impressive but unreliable.

A smaller working feature is better than a large broken feature.

---

# 17. Date and Time

Calendar reasoning must use the correct timezone.

Do not assume UTC when the user's configured/local timezone is different.

Display dates and times in a human-readable format.

---

# 18. Privacy

Only retrieve and process information necessary for the current product workflow.

Do not expose private source data unnecessarily in the UI.

---

# 19. Implementation Order

Follow the project phases in 04_PHASES.md.

Do not jump ahead unless there is a strong reason.

---

# 20. Final Principle

The product should always answer three questions:

1. What happened?
2. Why does it matter?
3. What should I do next?

If a feature does not help answer one of these questions, it should be questioned before being added.