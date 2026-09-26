(function () {
    'use strict';

    var API_BASE = window.APP_CONFIG.API_BASE_URL;

    var views = {
        disclaimer: document.getElementById('view-disclaimer'),
        intake: document.getElementById('view-intake'),
        chat: document.getElementById('view-chat'),
        result: document.getElementById('view-result')
    };

    var chatLog = document.getElementById('chatLog');
    var chatForm = document.getElementById('chatForm');
    var chatInput = document.getElementById('chatInput');
    var restartBtn = document.getElementById('restartBtn');

    // Full running conversation sent to the backend each turn, so the AI
    // keeps context. The backend re-attaches the system/safety prompt.
    var conversation = [];
    var patientContext = {};

    function showView(name) {
        Object.keys(views).forEach(function (key) {
            views[key].hidden = key !== name;
        });
        restartBtn.hidden = name === 'disclaimer';
    }

    function resetApp() {
        conversation = [];
        patientContext = {};
        chatLog.innerHTML = '';
        document.getElementById('intakeForm').reset();
        showView('disclaimer');
    }

    function addMessage(role, text) {
        var el = document.createElement('div');
        el.className = 'msg ' + (role === 'user' ? 'msg--user' : 'msg--ai');
        el.textContent = text;
        chatLog.appendChild(el);
        chatLog.scrollTop = chatLog.scrollHeight;
        return el;
    }

    function addErrorMessage(text) {
        var el = document.createElement('div');
        el.className = 'msg msg--error';

        var msg = document.createElement('div');
        msg.textContent = text;
        el.appendChild(msg);

        var retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'retry-btn';
        retry.textContent = 'Retry';
        retry.addEventListener('click', function () {
            el.remove();
            sendTurn();
        });
        el.appendChild(retry);

        chatLog.appendChild(el);
        chatLog.scrollTop = chatLog.scrollHeight;
        return el;
    }

    function showTyping() {
        var el = document.createElement('div');
        el.className = 'msg msg--typing';
        el.textContent = 'Thinking…';
        chatLog.appendChild(el);
        chatLog.scrollTop = chatLog.scrollHeight;
        return el;
    }

    function setSending(isSending) {
        chatInput.disabled = isSending;
        chatForm.querySelector('button').disabled = isSending;
    }

    // Sends the running conversation + patient context to the backend and
    // expects back either a follow-up question or a final triage result.
    function sendTurn() {
        setSending(true);
        var typingEl = showTyping();

        fetch(API_BASE + '/api/triage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                patient: patientContext,
                conversation: conversation
            })
        })
            .then(function (res) {
                if (!res.ok) { throw new Error('Server error (' + res.status + ')'); }
                return res.json();
            })
            .then(function (data) {
                typingEl.remove();
                setSending(false);

                if (data.type === 'result') {
                    renderResult(data);
                    showView('result');
                    return;
                }

                // type === 'question'
                conversation.push({ role: 'assistant', content: data.message });
                addMessage('assistant', data.message);
            })
            .catch(function (err) {
                typingEl.remove();
                setSending(false);
                addErrorMessage('Something went wrong reaching the assessment service: ' + err.message + '. Please try again.');
            });
    }

    function renderResult(data) {
        var banner = document.getElementById('urgencyBanner');
        var label = document.getElementById('urgencyLabel');
        var urgency = (data.urgency || 'low').toLowerCase();

        banner.className = 'urgency-banner' + (urgency !== 'low' ? ' urgency-' + urgency : '');
        label.textContent = {
            low: 'Likely non-urgent',
            moderate: 'See a doctor soon',
            urgent: 'Seek care promptly'
        }[urgency] || 'Assessment complete';

        var list = document.getElementById('possibleCauses');
        list.innerHTML = '';
        (data.possible_causes || []).forEach(function (cause) {
            var li = document.createElement('li');
            li.textContent = cause;
            list.appendChild(li);
        });

        document.getElementById('recommendation').textContent = data.recommendation || '';
    }

    // ---------- Screen: disclaimer ----------
    document.getElementById('acceptBtn').addEventListener('click', function () {
        showView('intake');
    });

    // ---------- Screen: intake ----------
    document.getElementById('intakeForm').addEventListener('submit', function (e) {
        e.preventDefault();

        patientContext = {
            age: document.getElementById('age').value,
            sex: document.getElementById('sex').value,
            history: document.getElementById('history').value
        };

        var symptomText = document.getElementById('symptomText').value.trim();
        conversation = [{ role: 'user', content: symptomText }];

        chatLog.innerHTML = '';
        addMessage('user', symptomText);
        showView('chat');
        sendTurn();
    });

    // ---------- Screen: chat ----------
    chatForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var text = chatInput.value.trim();
        if (!text) { return; }

        conversation.push({ role: 'user', content: text });
        addMessage('user', text);
        chatInput.value = '';
        sendTurn();
    });

    // ---------- Screen: result ----------
    document.getElementById('newCheckBtn').addEventListener('click', resetApp);
    restartBtn.addEventListener('click', function () {
        if (confirm('Start over? This will clear your current assessment.')) {
            resetApp();
        }
    });

    // ---------- Boot ----------
    document.addEventListener('deviceready', resetApp, false);
    // Fallback for testing in a plain browser (no Cordova device event fires there)
    if (!window.cordova) { document.addEventListener('DOMContentLoaded', resetApp); }
})();
