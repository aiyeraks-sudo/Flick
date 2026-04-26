let currentUser = localStorage.getItem('flick_user') || '';
let currentChallengeId = null;

if (currentUser) showUserBadge();

function setUsername() {
  const val = document.getElementById('usernameInput').value.trim();
  if (!val) return toast('Enter a name first');
  currentUser = val;
  localStorage.setItem('flick_user', val);
  showUserBadge();
  loadChallenges();
}

function showUserBadge() {
  document.getElementById('usernameInput').style.display = 'none';
  document.querySelector('.username-bar button').style.display = 'none';
  const display = document.getElementById('usernameDisplay');
  display.style.display = 'inline';
  display.textContent = currentUser;
}

function requireUser() {
  if (!currentUser) { toast('Set your name first'); return false; }
  return true;
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'view-home') loadChallenges();
  if (id === 'view-detail' && currentChallengeId) loadDetail(currentChallengeId);
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

function formatDate(iso) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// ── Home ──────────────────────────────────────────────

async function loadChallenges() {
  const res = await fetch('/api/challenges');
  const challenges = await res.json();
  const el = document.getElementById('challenges-list');

  if (!challenges.length) {
    el.innerHTML = `<div class="empty-state"><p>No challenges yet.</p><button class="btn btn-primary" onclick="showView('view-create')">Create the first one</button></div>`;
    return;
  }

  el.innerHTML = challenges.map(c => `
    <div class="card" onclick="openChallenge('${c.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <h3>${c.name}</h3>
        <span class="badge badge-${c.status}">${c.status}</span>
      </div>
      <div class="meta">By ${c.createdBy} · ${c.members.length} members · Deadline: ${formatDate(c.deadline)}</div>
      <div>
        <strong>$${c.stakePerPerson}</strong> per person &nbsp;·&nbsp;
        ${c.proofs.length}/${c.members.length} proofs submitted
      </div>
    </div>
  `).join('');
}

// ── Create ────────────────────────────────────────────

async function createChallenge() {
  if (!requireUser()) return;
  const name = document.getElementById('c-name').value.trim();
  const description = document.getElementById('c-desc').value.trim();
  const deadline = document.getElementById('c-deadline').value;
  const stakePerPerson = document.getElementById('c-stake').value;
  const membersRaw = document.getElementById('c-members').value;

  if (!name || !deadline || !stakePerPerson) return toast('Name, deadline, and stake are required');

  const members = membersRaw.split(',').map(m => m.trim()).filter(Boolean);

  const res = await fetch('/api/challenges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, deadline, stakePerPerson, createdBy: currentUser, members })
  });

  if (!res.ok) { const e = await res.json(); return toast(e.error); }
  const challenge = await res.json();
  toast('Challenge created!');
  currentChallengeId = challenge.id;
  showView('view-detail');
}

// ── Detail ────────────────────────────────────────────

function openChallenge(id) {
  currentChallengeId = id;
  showView('view-detail');
}

async function loadDetail(id) {
  const res = await fetch(`/api/challenges/${id}`);
  const c = await res.json();
  const el = document.getElementById('detail-content');

  const userProof = c.proofs.find(p => p.userId === currentUser);
  const isMember = c.members.includes(currentUser);
  const totalPot = c.stakePerPerson * c.members.length;

  let proofsHtml = '';
  if (c.proofs.length === 0) {
    proofsHtml = '<div class="no-proofs">No proofs submitted yet.</div>';
  } else {
    proofsHtml = `<div class="proofs-grid">${c.proofs.map(p => {
      const alreadyVoted = p.votes[currentUser] !== undefined;
      const canVote = isMember && currentUser !== p.userId && !alreadyVoted && c.status === 'voting';

      let verdictHtml = '';
      if (p.verified === true) verdictHtml = '<div class="verdict verdict-pass">✓ Verified</div>';
      else if (p.verified === false) verdictHtml = '<div class="verdict verdict-fail">✗ Rejected</div>';
      else verdictHtml = '<div class="verdict verdict-pending">Pending votes</div>';

      const voteButtons = canVote ? `
        <div class="vote-btns">
          <button class="btn btn-success btn-sm" onclick="vote('${c.id}', '${p.userId}', true)">✓ Legit</button>
          <button class="btn btn-danger btn-sm" onclick="vote('${c.id}', '${p.userId}', false)">✗ Fake</button>
        </div>` : (alreadyVoted && p.verified === null ? '<div style="font-size:0.8rem;color:#888">Voted ✓</div>' : '');

      return `
        <div class="proof-card">
          <img src="${p.photoUrl}" alt="Proof by ${p.userId}">
          <div class="proof-info">
            <div class="proof-user">${p.userId}</div>
            <div class="proof-time">${formatDate(p.submittedAt)}</div>
            ${verdictHtml}
            ${voteButtons}
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  let settlementHtml = '';
  if (c.status === 'settled' && c.settlement) {
    const s = c.settlement;
    settlementHtml = `
      <div class="settlement-box">
        <h3>Settlement</h3>
        ${s.winners.length > 0 ? `<p>🏆 Winners: <strong>${s.winners.join(', ')}</strong></p>` : ''}
        ${s.losers.length > 0 ? `<p>💸 Losers: <strong>${s.losers.join(', ')}</strong></p>` : ''}
        ${s.totalPot > 0
          ? `<p>Winners each get: <strong>$${s.winnerShare}</strong> from the $${s.totalPot} pot</p>`
          : `<p>Everyone succeeded — all stakes returned!</p>`}
      </div>`;
  }

  const submitBtn = isMember && !userProof && c.status === 'active' ? `
    <div style="margin-top:16px">
      <div class="section-title">Submit Your Proof</div>
      <input type="file" id="proofFile" accept="image/*" style="margin-bottom:8px">
      <button class="btn btn-primary" onclick="submitProof('${c.id}')">Submit Photo</button>
    </div>` : '';

  const joinBtn = !isMember && c.status === 'active' ? `
    <button class="btn btn-secondary" style="margin-top:12px" onclick="joinChallenge('${c.id}')">Join Challenge</button>` : '';

  el.innerHTML = `
    <div class="challenge-detail">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <h2>${c.name}</h2>
        <span class="badge badge-${c.status}">${c.status}</span>
      </div>
      ${c.description ? `<p class="desc">${c.description}</p>` : ''}
      <div class="info-row">
        <div class="info-item"><div class="label">Stake</div><div class="value">$${c.stakePerPerson}/person</div></div>
        <div class="info-item"><div class="label">Total Pot</div><div class="value">$${totalPot}</div></div>
        <div class="info-item"><div class="label">Deadline</div><div class="value" style="font-size:0.95rem">${formatDate(c.deadline)}</div></div>
      </div>
      <div class="section-title">Members</div>
      <div class="members-list">${c.members.map(m => `<span class="member-chip">${m}</span>`).join('')}</div>
      ${joinBtn}
      <div class="section-title">Proofs (${c.proofs.length}/${c.members.length})</div>
      ${proofsHtml}
      ${submitBtn}
      ${settlementHtml}
    </div>`;
}

async function joinChallenge(id) {
  if (!requireUser()) return;
  const res = await fetch(`/api/challenges/${id}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser })
  });
  if (!res.ok) { const e = await res.json(); return toast(e.error); }
  toast('Joined challenge!');
  loadDetail(id);
}

async function submitProof(id) {
  if (!requireUser()) return;
  const file = document.getElementById('proofFile').files[0];
  if (!file) return toast('Select a photo first');

  const form = new FormData();
  form.append('username', currentUser);
  form.append('photo', file);

  const res = await fetch(`/api/challenges/${id}/proof`, { method: 'POST', body: form });
  if (!res.ok) { const e = await res.json(); return toast(e.error); }
  toast('Proof submitted!');
  loadDetail(id);
}

async function vote(challengeId, targetUser, approved) {
  if (!requireUser()) return;
  const res = await fetch(`/api/challenges/${challengeId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voter: currentUser, targetUser, approved })
  });
  if (!res.ok) { const e = await res.json(); return toast(e.error); }
  toast(approved ? 'Voted: Legit ✓' : 'Voted: Fake ✗');
  loadDetail(challengeId);
}

// Initial load
loadChallenges();
