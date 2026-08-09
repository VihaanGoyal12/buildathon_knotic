document.addEventListener('DOMContentLoaded', () => {
  // DOM Cache
  const dateBadge = document.getElementById('today-date');
  const refreshBtn = document.getElementById('btn-refresh');
  const execSummary = document.getElementById('executive-summary');
  const prioritiesContainer = document.getElementById('priorities-container');
  const notionContainer = document.getElementById('notion-container');
  const scheduleContainer = document.getElementById('schedule-container');
  const conflictBox = document.getElementById('conflict-box');
  const conflictList = document.getElementById('conflict-list');
  const emailsContainer = document.getElementById('emails-container');
  const actionsContainer = document.getElementById('actions-container');
  const emailInput = document.getElementById('email-input');
  const sendEmailBtn = document.getElementById('btn-send-email');
  const toastContainer = document.getElementById('toast-container');

  let currentBriefingData = null;

  // Set today's date
  const updateDateDisplay = () => {
    const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
    dateBadge.textContent = new Date().toLocaleDateString('en-US', options);
  };
  updateDateDisplay();

  // Helper: Show Toast Notification
  const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '✅' : '❌'}</span>
      <span class="toast-message">${message}</span>
    `;
    toastContainer.appendChild(toast);
    
    // Auto-remove toast
    setTimeout(() => {
      toast.style.animation = 'slide-in 0.3s reverse forwards';
      toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
  };

  // Helper: Format Time string (e.g. ISO string to HH:MM)
  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return isoString;
    }
  };

  // Render Functions
  const renderBriefing = (data) => {
    currentBriefingData = data;

    // 1. Executive Summary
    execSummary.textContent = data.executiveSummary || "No summary generated for today.";

    // 2. Priorities
    if (!data.priorities || data.priorities.length === 0) {
      prioritiesContainer.innerHTML = '<div class="loading-state">No critical priorities identified today.</div>';
    } else {
      prioritiesContainer.innerHTML = data.priorities.map(p => `
        <div class="priority-item ${p.level.toLowerCase()}">
          <div class="priority-header">
            <span class="priority-title">${p.title}</span>
            <span class="priority-badge ${p.level.toLowerCase()}">${p.level}</span>
          </div>
          <p class="priority-desc">${p.description}</p>
          <div class="priority-relations">
            ${p.relatedEmail ? `<span class="rel-tag">📧 Email: ${p.relatedEmail}</span>` : ''}
            ${p.relatedMeeting ? `<span class="rel-tag">📅 Meet: ${p.relatedMeeting}</span>` : ''}
          </div>
          <div class="priority-action">
            <strong>Action Needed:</strong> ${p.recommendedAction}
          </div>
        </div>
      `).join('');
    }

    // 3. Notion Context
    if (!data.notionContext || !data.notionContext.clients || data.notionContext.clients.length === 0) {
      notionContainer.innerHTML = '<div class="loading-state">No context databases found.</div>';
    } else {
      notionContainer.innerHTML = data.notionContext.clients.map(client => `
        <div class="notion-item">
          <div class="notion-item-title">${client.name} (Contact: ${client.contactPerson})</div>
          <p class="notion-item-notes">${client.notes}</p>
        </div>
      `).join('');
    }

    // 4. Schedule & Conflicts
    if (data.conflicts && data.conflicts.length > 0) {
      conflictBox.style.display = 'block';
      conflictList.innerHTML = data.conflicts.map(c => `
        <div class="conflict-detail">
          <strong>${c.event1}</strong> overlaps with <strong>${c.event2}</strong> (${c.timeRange})
        </div>
        <div class="conflict-res">${c.resolution}</div>
      `).join('');
    } else {
      conflictBox.style.display = 'none';
      conflictList.innerHTML = '';
    }

    if (!data.todaySchedule || data.todaySchedule.length === 0) {
      scheduleContainer.innerHTML = '<div class="loading-state">No meetings scheduled for today.</div>';
    } else {
      scheduleContainer.innerHTML = data.todaySchedule.map(s => {
        const isConflict = data.conflicts && data.conflicts.some(c => c.event1 === s.summary || c.event2 === s.summary);
        return `
          <div class="timeline-item ${isConflict ? 'active' : ''}">
            <div class="time-label">${formatTime(s.start)} - ${formatTime(s.end)}</div>
            <div class="event-title">${s.summary}</div>
            <p class="event-desc">${s.description}</p>
            <div class="event-attendees">Attendees: ${s.attendees}</div>
          </div>
        `;
      }).join('');
    }

    // 5. Emails
    if (!data.urgentEmails || data.urgentEmails.length === 0) {
      emailsContainer.innerHTML = '<div class="loading-state">No urgent communications requiring response.</div>';
    } else {
      emailsContainer.innerHTML = data.urgentEmails.map(e => `
        <div class="email-item">
          <div class="email-sender">From: ${e.from}</div>
          <div class="email-subject-row">
            <span class="email-subject">${e.subject}</span>
            <span class="urgent-pill">Urgent</span>
          </div>
          <p class="email-snippet">${e.snippet}</p>
        </div>
      `).join('');
    }

    // 6. Actions Checklist (with state persistence)
    const storedCheckboxState = JSON.parse(localStorage.getItem('actions_checklist_state') || '{}');
    
    if (!data.recommendedActions || data.recommendedActions.length === 0) {
      actionsContainer.innerHTML = '<li class="loading-state">No recommended actions generated.</li>';
    } else {
      actionsContainer.innerHTML = data.recommendedActions.map((action, idx) => {
        const key = `action_${idx}`;
        const checked = storedCheckboxState[key] ? 'checked' : '';
        return `
          <li class="action-checkbox-item">
            <input type="checkbox" id="${key}" ${checked}>
            <label for="${key}">${action}</label>
          </li>
        `;
      }).join('');

      // Add listeners to checkboxes
      data.recommendedActions.forEach((_, idx) => {
        const key = `action_${idx}`;
        document.getElementById(key).addEventListener('change', (e) => {
          const state = JSON.parse(localStorage.getItem('actions_checklist_state') || '{}');
          state[key] = e.target.checked;
          localStorage.setItem('actions_checklist_state', JSON.stringify(state));
        });
      });
    }
  };

  // Fetch Briefing Data
  const fetchBriefing = async () => {
    // Show Loading Spinners
    const refreshIcon = refreshBtn.querySelector('.btn-icon');
    refreshIcon.classList.add('spin-icon');
    refreshBtn.disabled = true;

    try {
      const response = await fetch('/api/briefing');
      if (!response.ok) {
        throw new Error(`Server returned error status ${response.status}`);
      }
      const data = await response.json();
      renderBriefing(data);
      showToast('Briefing loaded successfully.');
    } catch (error) {
      console.error('Failed to load briefing:', error);
      showToast(`Failed to load briefing: ${error.message}`, 'error');
    } finally {
      refreshIcon.classList.remove('spin-icon');
      refreshBtn.disabled = false;
    }
  };

  // Compile Briefing to HTML for email delivery
  const compileEmailHtml = (data) => {
    const prioritiesHtml = data.priorities.map(p => `
      <div style="border-left: 4px solid #ef4444; background: #f9fafb; padding: 12px; margin-bottom: 12px;">
        <h4 style="margin: 0 0 6px 0;">[${p.level}] ${p.title}</h4>
        <p style="margin: 0 0 8px 0; color: #4b5563;">${p.description}</p>
        <div style="background: #eef2ff; border: 1px solid #c7d2fe; padding: 8px; font-weight: 500; font-size: 14px;">
          <strong>Action Needed:</strong> ${p.recommendedAction}
        </div>
      </div>
    `).join('');

    const scheduleHtml = data.todaySchedule.map(s => `
      <li style="margin-bottom: 8px;">
        <strong>${formatTime(s.start)} - ${formatTime(s.end)}</strong>: ${s.summary}<br>
        <span style="color: #6b7280; font-size: 13px;">${s.description}</span>
      </li>
    `).join('');

    const emailsHtml = data.urgentEmails.map(e => `
      <div style="border-bottom: 1px solid #e5e7eb; padding: 8px 0;">
        <span style="font-size: 12px; color: #6b7280;">From: ${e.from}</span><br>
        <strong>${e.subject}</strong><br>
        <span style="color: #4b5563; font-size: 13px;">${e.snippet}</span>
      </div>
    `).join('');

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #111827;">
        <h2 style="color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Aegis AI - Executive Morning Briefing</h2>
        <p style="font-style: italic; color: #4b5563;">Generated on ${new Date().toLocaleDateString()}</p>
        
        <h3>Executive Summary</h3>
        <p style="line-height: 1.5; background: #f3f4f6; padding: 12px; border-radius: 6px;">${data.executiveSummary}</p>
        
        <h3>Top Priorities</h3>
        ${prioritiesHtml}
        
        <h3>Today's Schedule</h3>
        <ul>
          ${scheduleHtml}
        </ul>
        
        <h3>Urgent Emails</h3>
        ${emailsHtml}
        
        <p style="margin-top: 24px; font-size: 12px; color: #9ca3af; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 8px;">
          Aegis AI Assistant powered by Swytchcode.
        </p>
      </div>
    `;
  };

  // Send Email Briefing
  const sendEmail = async () => {
    if (!currentBriefingData) {
      showToast('No briefing data available to send.', 'error');
      return;
    }

    const recipient = emailInput.value.trim();
    if (!recipient) {
      showToast('Please enter a valid recipient email.', 'error');
      return;
    }

    sendEmailBtn.disabled = true;
    sendEmailBtn.textContent = 'Sending...';

    try {
      const briefingHtml = compileEmailHtml(currentBriefingData);
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ recipient, briefingHtml })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to send email.');
      }

      showToast(`Briefing successfully sent to ${recipient}!`);
    } catch (error) {
      console.error('Failed to send email:', error);
      showToast(`Failed to send email: ${error.message}`, 'error');
    } finally {
      sendEmailBtn.disabled = false;
      sendEmailBtn.textContent = '📧 Email Briefing';
    }
  };

  // Event Listeners
  refreshBtn.addEventListener('click', fetchBriefing);
  sendEmailBtn.addEventListener('click', sendEmail);

  // Initialize: Load initial briefing
  fetchBriefing();
});
