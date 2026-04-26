// ── Auth state ────────────────────────────────────────
let storedUser = localStorage.getItem('flick_user') || '';
if (storedUser.includes('@')) { localStorage.removeItem('flick_user'); storedUser = ''; }

let currentUser      = storedUser;
let currentUserEmail = localStorage.getItem('flick_email') || '';
let currentChallengeId = null;
let viewHistory = [];

// ── URL params (invite accept/decline redirect) ───────
const params = new URLSearchParams(window.location.search);
if (params.get('join')) {
  currentChallengeId = params.get('join');
  const invited = params.get('invited');
  const action   = params.get('action');
  if (invited && action === 'accept' && !currentUser) {
    const nameHint = invited.includes('@') ? invited.split('@')[0] : invited;
    document.getElementById('profileNameInput').value = nameHint;
  }
  window.history.replaceState({}, '', '/');
}

// ── Boot ──────────────────────────────────────────────
if (currentUser) {
  showApp();
} else {
  showSignInScreen();
}

// ── Profile / Auth ────────────────────────────────────

function showSignInScreen() {
  document.getElementById('signin-screen').style.display = 'flex';
  document.getElementById('app-main').style.display      = 'none';
  document.getElementById('profileChip').style.display   = 'none';
  document.getElementById('walletBtn').style.display     = 'none';
  document.getElementById('signInBtn').style.display     = 'none';
  setTimeout(() => document.getElementById('profileNameInput').focus(), 100);
}

function showApp() {
  document.getElementById('signin-screen').style.display = 'none';
  document.getElementById('app-main').style.display      = 'block';
  document.getElementById('signInBtn').style.display     = 'none';
  const initial = currentUser.charAt(0).toUpperCase();
  document.getElementById('profileAvatar').textContent    = initial;
  document.getElementById('profileAvatarLg').textContent  = initial;
  document.getElementById('profileName').textContent      = currentUser;
  document.getElementById('profileModalName').textContent = currentUser;
  document.getElementById('profileModalEmail').textContent = currentUserEmail || 'No email set';
  document.getElementById('profileChip').style.display   = 'flex';
  document.getElementById('walletBtn').style.display     = 'inline-flex';
  updateBalanceDisplay();
  loadChallenges();
}

function createProfile() {
  const name  = document.getElementById('profileNameInput').value.trim();
  const email = document.getElementById('profileEmailInput').value.trim();
  const phone = document.getElementById('profilePhoneInput').value.trim();
  if (!name) return toast('Enter your name');
  currentUser      = name;
  currentUserEmail = email;
  localStorage.setItem('flick_user', name);
  if (email) localStorage.setItem('flick_email', email);
  if (phone) localStorage.setItem('flick_phone', phone);
  fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email: email || undefined, phone: phone || undefined }),
  }).catch(() => {});
  showApp();
}

function openProfile() {
  document.getElementById('profileModal').classList.add('open');
}
function closeProfile() {
  document.getElementById('profileModal').classList.remove('open');
}
function closeProfileOnOverlay(e) {
  if (e.target === document.getElementById('profileModal')) closeProfile();
}

function signOut() {
  localStorage.removeItem('flick_user');
  localStorage.removeItem('flick_email');
  currentUser      = '';
  currentUserEmail = '';
  closeProfile();
  document.getElementById('profileNameInput').value = '';
  document.getElementById('profileEmailInput').value = '';
  showSignInScreen();
}

document.getElementById('profileNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') createProfile();
});

function requireUser() {
  if (!currentUser) { showSignInScreen(); return false; }
  return true;
}

function goHome() {
  if (!currentUser) return;
  showView('view-home', false);
}

function showView(id, pushHistory = true) {
  const current = document.querySelector('.view.active');
  if (pushHistory && current && current.id !== id) viewHistory.push(current.id);
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('globalBack').style.display = id === 'view-home' ? 'none' : 'inline-block';
  if (id === 'view-home') { viewHistory = []; loadChallenges(); }
  if (id === 'view-detail' && currentChallengeId) loadDetail(currentChallengeId);
}

function goBack() {
  const prev = viewHistory.pop() || 'view-home';
  showView(prev, false);
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

// ── Wallet ────────────────────────────────────────────

function getWallets() {
  return JSON.parse(localStorage.getItem('flick_wallets') || '{}');
}

function getBalance(user) {
  return getWallets()[user] ?? 100;
}

function setBalance(user, amount) {
  const wallets = getWallets();
  wallets[user] = amount;
  localStorage.setItem('flick_wallets', JSON.stringify(wallets));
  updateBalanceDisplay();
}

function updateBalanceDisplay() {
  if (!currentUser) return;
  const bal = getBalance(currentUser);
  const btn = document.getElementById('walletBtn');
  if (btn) btn.textContent = `💰 $${Number(bal).toFixed(2)}`;
  const modal = document.getElementById('modalBalance');
  if (modal) modal.textContent = `$${Number(bal).toFixed(2)}`;
}

function openWallet() {
  if (!requireUser()) return;
  updateBalanceDisplay();
  document.getElementById('walletModal').classList.add('open');
}

function closeWallet() {
  document.getElementById('walletModal').classList.remove('open');
}

function closeWalletOnOverlay(e) {
  if (e.target === document.getElementById('walletModal')) closeWallet();
}

function setTopUpAmount(amt) {
  document.getElementById('topUpAmount').value = amt;
}

function doTopUp() {
  const amt = parseFloat(document.getElementById('topUpAmount').value);
  if (isNaN(amt) || amt <= 0) return toast('Enter a valid amount');
  setBalance(currentUser, getBalance(currentUser) + amt);
  document.getElementById('topUpAmount').value = '';
  toast(`Added $${amt.toFixed(2)} to your wallet`);
}

function doWithdraw() {
  const amt = parseFloat(document.getElementById('withdrawAmount').value);
  const routing = document.getElementById('bankRouting').value.trim();
  const account = document.getElementById('bankAccount').value.trim();
  if (isNaN(amt) || amt <= 0) return toast('Enter a valid amount');
  if (!routing || !account) return toast('Enter your bank details');
  const bal = getBalance(currentUser);
  if (amt > bal) return toast(`Insufficient balance ($${bal.toFixed(2)})`);
  setBalance(currentUser, bal - amt);
  document.getElementById('withdrawAmount').value = '';
  document.getElementById('bankRouting').value = '';
  document.getElementById('bankAccount').value = '';
  toast(`Withdrawal of $${amt.toFixed(2)} initiated`);
}

// ── Home ──────────────────────────────────────────────

let activeTab = 'active';

function switchTab(tab) {
  activeTab = tab;
  ['active', 'history', 'friends', 'feed'].forEach(t => {
    document.getElementById(`tab-content-${t}`).style.display = t === tab ? 'block' : 'none';
    document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
  });
  if (tab === 'history') renderHistory();
  if (tab === 'friends') loadFriends();
  if (tab === 'feed')    renderFeed();
}

// ── Feed ─────────────────────────────────────────────

let allUsers = [];

async function renderFeed() {
  const el = document.getElementById('list-feed');
  el.innerHTML = '<div class="empty-sub">Loading...</div>';

  const [usersRes, challengesRes] = await Promise.all([
    fetch('/api/users'),
    fetch('/api/challenges'),
  ]);
  allUsers      = await usersRes.json();
  allChallenges = await challengesRes.json();

  const now = new Date();
  const feedChallenges = allChallenges.filter(c =>
    new Date(c.deadline) >= now &&
    !c.members.includes(currentUser)
  );

  if (!feedChallenges.length) {
    el.innerHTML = '<div class="empty-state"><p>Nothing in the feed yet.<br>When your friends create challenges you\'ll see them here.</p></div>';
    return;
  }

  el.innerHTML = feedChallenges.map(c => {
    const knownMembers = c.members.filter(m => allUsers.find(u => u.name === m));
    const memberAvatars = c.members.map(m =>
      `<span class="feed-avatar" title="${m}">${m.charAt(0).toUpperCase()}</span>`
    ).join('');

    const memberNames = c.members.length === 1
      ? c.members[0]
      : c.members.length === 2
        ? `${c.members[0]} and ${c.members[1]}`
        : `${c.members[0]}, ${c.members[1]} +${c.members.length - 2} more`;

    const newPot = (c.members.length + 1) * c.stakePerPerson;

    return `
      <div class="feed-card" onclick="openChallenge('${c.id}')">
        <div class="feed-card-top">
          <div class="feed-avatars">${memberAvatars}</div>
          <span class="badge badge-${c.status}">${c.status}</span>
        </div>
        <div class="feed-who">${memberNames} ${c.members.length === 1 ? 'is' : 'are'} betting on this</div>
        <h3 class="feed-title">${c.name}</h3>
        ${c.description ? `<p class="feed-desc">${c.description}</p>` : ''}
        <div class="feed-meta">
          <span>$${c.stakePerPerson}/person</span>
          <span>·</span>
          <span>${c.members.length} in · pot $${c.stakePerPerson * c.members.length}</span>
          <span>·</span>
          <span>Ends ${formatDate(c.deadline)}</span>
        </div>
        <button class="btn btn-primary feed-join-btn" onclick="event.stopPropagation(); joinChallenge('${c.id}')">
          Join · split becomes $${newPot} pot
        </button>
      </div>`;
  }).join('');
}

// ── Friends ───────────────────────────────────────────

let quickChallengeFriend = null;

async function addFriend() {
  if (!requireUser()) return;
  const email = document.getElementById('addFriendEmail').value.trim();
  const phone = document.getElementById('addFriendPhone').value.trim();
  if (!email && !phone) return toast('Enter an email or phone number');
  if (email && !email.includes('@')) return toast('Enter a valid email');
  const btn = document.querySelector('.add-friend-bar button');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  const res = await fetch('/api/users/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email || undefined, phone: phone || undefined, invitedBy: currentUser }),
  });
  btn.disabled = false;
  btn.textContent = '+ Invite';
  if (!res.ok) return toast('Failed to send invite');
  document.getElementById('addFriendEmail').value = '';
  document.getElementById('addFriendPhone').value = '';
  toast(`Invite sent to ${email || phone}!`);
  loadFriends();
}

async function loadFriends() {
  const el = document.getElementById('list-friends');
  el.innerHTML = '<div class="empty-sub">Loading...</div>';
  const res = await fetch('/api/users');
  const users = await res.json();
  const others = users.filter(u => u.name !== currentUser);

  if (!others.length) {
    el.innerHTML = '<div class="empty-state"><p>No other users on Flick yet.</p></div>';
    return;
  }

  el.innerHTML = others.map(u => `
    <div class="friend-card">
      <div class="friend-avatar">${u.name.charAt(0).toUpperCase()}</div>
      <div class="friend-info">
        <div class="friend-name">${u.name}</div>
        <div class="friend-joined">Joined ${formatDate(u.joinedAt)}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openQuickChallenge('${u.name}')">Challenge →</button>
    </div>
  `).join('');
}

function openQuickChallenge(friendName) {
  if (!requireUser()) return;
  quickChallengeFriend = friendName;
  document.getElementById('qc-friend-name').textContent = friendName;
  document.getElementById('qc-name').value = '';
  document.getElementById('qc-deadline').value = '';
  document.getElementById('qc-stake').value = '';
  document.getElementById('quickChallengeModal').classList.add('open');
}

function closeQuickChallenge() {
  document.getElementById('quickChallengeModal').classList.remove('open');
  quickChallengeFriend = null;
}

function closeQuickChallengeOnOverlay(e) {
  if (e.target === document.getElementById('quickChallengeModal')) closeQuickChallenge();
}

async function sendQuickChallenge() {
  if (!requireUser() || !quickChallengeFriend) return;
  const name     = document.getElementById('qc-name').value.trim();
  const deadline = document.getElementById('qc-deadline').value;
  const stake    = document.getElementById('qc-stake').value;
  if (!name || !deadline || !stake) return toast('Fill in all fields');

  const res = await fetch('/api/challenges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      deadline,
      stakePerPerson: stake,
      createdBy: currentUser,
      directMembers: [quickChallengeFriend],
    }),
  });
  if (!res.ok) { const e = await res.json(); return toast(e.error); }
  closeQuickChallenge();
  toast(`Challenge pushed to ${quickChallengeFriend}!`);
  allChallenges = await (await fetch('/api/challenges')).json();
  switchTab('active');
}

function challengeCard(c) {
  return `
    <div class="card" onclick="openChallenge('${c.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <h3>${c.name}</h3>
        <span class="badge badge-${c.status}">${c.status}</span>
      </div>
      <div class="meta">By ${c.createdBy} · ${c.members.length} member${c.members.length !== 1 ? 's' : ''} · Deadline: ${formatDate(c.deadline)}</div>
      <div><strong>$${c.stakePerPerson}</strong> per person</div>
    </div>`;
}

function inviteStatusRow(c) {
  if (!c.invitations || !c.invitations.length) return '';
  const accepted = c.invitations.filter(i => i.status === 'accepted').length;
  const declined = c.invitations.filter(i => i.status === 'declined').length;
  const pending  = c.invitations.filter(i => i.status === 'pending').length;
  return `
    <div class="card" onclick="openChallenge('${c.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <h3>${c.name}</h3>
        <span class="badge badge-${c.status}">${c.status}</span>
      </div>
      <div class="meta">Deadline: ${formatDate(c.deadline)} · <strong>$${c.stakePerPerson}</strong>/person</div>
      <div class="invite-tally">
        ${accepted ? `<span class="tally tally-accepted">✓ ${accepted} accepted</span>` : ''}
        ${declined ? `<span class="tally tally-declined">✗ ${declined} declined</span>` : ''}
        ${pending  ? `<span class="tally tally-pending">⏳ ${pending} pending</span>` : ''}
      </div>
    </div>`;
}

let allChallenges = [];

async function loadChallenges() {
  if (currentUser) updateBalanceDisplay();
  const res = await fetch('/api/challenges');
  allChallenges = await res.json();

  if (currentChallengeId) {
    const target = allChallenges.find(c => c.id === currentChallengeId);
    if (target) { openChallenge(currentChallengeId); currentChallengeId = null; return; }
  }

  renderActiveTab();
  if (activeTab === 'history') renderHistory();
}

function renderActiveTab() {
  const now = new Date();
  const sent = allChallenges.filter(c => c.createdBy === currentUser && new Date(c.deadline) >= now);
  const open = allChallenges.filter(c => c.createdBy !== currentUser && new Date(c.deadline) >= now);

  const sentEl = document.getElementById('list-sent');
  const openEl = document.getElementById('list-open');

  sentEl.innerHTML = sent.length
    ? sent.map(inviteStatusRow).join('')
    : '<div class="empty-sub">No active challenges created by you.</div>';

  openEl.innerHTML = open.length
    ? open.map(challengeCard).join('')
    : '<div class="empty-sub">No open challenges from others right now.</div>';
}

function renderHistory() {
  const el = document.getElementById('list-history');
  const closed = allChallenges.filter(c => new Date(c.deadline) < new Date());

  if (!closed.length) {
    el.innerHTML = '<div class="empty-state"><p>No bet history yet.</p></div>';
    return;
  }

  el.innerHTML = closed.map(c => {
    const s = c.settlement;
    const won  = s && s.winners.includes(currentUser);
    const lost = s && s.losers.includes(currentUser);
    const outcomeTag = c.status === 'settled'
      ? (won
          ? `<span class="tally tally-accepted">Won $${s.winnerShare}</span>`
          : lost
            ? `<span class="tally tally-declined">Lost $${c.stakePerPerson}</span>`
            : `<span class="tally tally-pending">Settled</span>`)
      : `<span class="tally tally-pending">Awaiting settlement</span>`;

    return `
      <div class="card" onclick="openChallenge('${c.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <h3>${c.name}</h3>
          <span class="badge badge-${c.status}">${c.status}</span>
        </div>
        <div class="meta">By ${c.createdBy} · Ended ${formatDate(c.deadline)}</div>
        <div class="invite-tally">${outcomeTag}</div>
      </div>`;
  }).join('');
}

// ── Create ────────────────────────────────────────────

async function createChallenge() {
  if (!requireUser()) return;
  const name = document.getElementById('c-name').value.trim();
  const description = document.getElementById('c-desc').value.trim();
  const deadline = document.getElementById('c-deadline').value;
  const stakePerPerson = document.getElementById('c-stake').value;
  const emailsRaw = document.getElementById('c-emails').value;

  if (!name || !deadline || !stakePerPerson) return toast('Name, deadline, and stake are required');

  const inviteEmails = emailsRaw.split(',').map(e => e.trim()).filter(Boolean);

  const res = await fetch('/api/challenges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, deadline, stakePerPerson, createdBy: currentUser, inviteEmails })
  });

  if (!res.ok) { const e = await res.json(); return toast(e.error); }
  const challenge = await res.json();
  toast(inviteEmails.length ? `Challenge created! Invites sent to ${inviteEmails.length} friend(s).` : 'Challenge created!');
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

  // Invitations list
  let invitesHtml = '';
  if (c.invitations && c.invitations.length > 0) {
    invitesHtml = `
      <div class="section-title">Invitations</div>
      <div class="invites-list">
        ${c.invitations.map(i => `
          <div class="invite-row">
            <span>${i.email}</span>
            <span class="invite-status invite-${i.status}">${i.status}</span>
          </div>`).join('')}
      </div>`;
  }

  // Proofs
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
        </div>` : (alreadyVoted && p.verified === null ? '<div style="font-size:0.8rem;color:#888">Voted</div>' : '');

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

  // Settlement
  let settlementHtml = '';
  if (c.status === 'settled' && c.settlement) {
    const s = c.settlement;
    settlementHtml = `
      <div class="settlement-box">
        <h3>Settlement</h3>
        ${s.winners.length > 0 ? `<p>Winners: <strong>${s.winners.join(', ')}</strong></p>` : ''}
        ${s.losers.length > 0 ? `<p>Losers: <strong>${s.losers.join(', ')}</strong></p>` : ''}
        ${s.totalPot > 0
          ? `<p>Winners each receive: <strong>$${s.winnerShare}</strong> from the $${s.totalPot} pot</p>`
          : `<p>Everyone succeeded — all stakes returned!</p>`}
      </div>`;
  }

  // Submit proof
  const submitBtn = isMember && !userProof && c.status === 'active' ? `
    <div style="margin-top:20px">
      <div class="section-title">Submit Your Proof</div>
      <input type="file" id="proofFile" accept="image/*" style="margin-bottom:8px;display:block">
      <button class="btn btn-primary" onclick="submitProof('${c.id}')">Submit Photo</button>
    </div>` : '';

  const joinBtn = !isMember && c.status === 'active' ? `
    <button class="btn btn-secondary" style="margin-top:12px" onclick="joinChallenge('${c.id}')">Join Challenge</button>` : '';

  // Send more invites
  const inviteMoreHtml = (c.createdBy === currentUser && c.status === 'active') ? `
    <div class="invite-section">
      <div class="section-title">Invite More Friends</div>
      <div class="invite-row-input">
        <input type="text" id="extraEmails" placeholder="email@example.com, ...">
        <button class="btn btn-secondary btn-sm" onclick="sendMoreInvites('${c.id}')">Send Invites</button>
      </div>
    </div>` : '';

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
      <div class="section-title">Members (${c.members.length})</div>
      <div class="members-list">${c.members.map(m => `<span class="member-chip">${m}</span>`).join('')}</div>
      ${invitesHtml}
      ${joinBtn}
      <div class="section-title">Proofs (${c.proofs.length}/${c.members.length})</div>
      ${proofsHtml}
      ${submitBtn}
      ${settlementHtml}
      ${inviteMoreHtml}
    </div>`;
}

async function sendMoreInvites(id) {
  const raw = document.getElementById('extraEmails').value;
  const emails = raw.split(',').map(e => e.trim()).filter(Boolean);
  if (!emails.length) return toast('Enter at least one email');
  const res = await fetch(`/api/challenges/${id}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emails })
  });
  if (!res.ok) { const e = await res.json(); return toast(e.error); }
  toast(`Invites sent to ${emails.length} friend(s)!`);
  loadDetail(id);
}

async function joinChallenge(id) {
  if (!requireUser()) return;
  const res = await fetch(`/api/challenges/${id}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser }),
  });
  if (!res.ok) { const e = await res.json(); return toast(e.error); }
  allChallenges = await (await fetch('/api/challenges')).json();
  toast('You\'re in! Pot updated.');
  if (activeTab === 'feed') renderFeed();
  else openChallenge(id);
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
