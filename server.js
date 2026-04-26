require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { Resend } = require('resend');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const DB_PATH = path.join(__dirname, 'data/db.json');
const upload = multer({ dest: 'uploads/' });
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const resend = new Resend(process.env.RESEND_API_KEY);

function readDB() {
  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  if (!data.users) data.users = [];
  return data;
}
function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

function emailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

function iMessageConfigured() {
  return !!(process.env.SENDBLUE_API_KEY_ID && process.env.SENDBLUE_SECRET_KEY);
}

async function sendIMessage(phone, content) {
  if (!iMessageConfigured()) return;
  const number = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
  await fetch('https://api.sendblue.co/api/send-message', {
    method: 'POST',
    headers: {
      'sb-api-key-id': process.env.SENDBLUE_API_KEY_ID,
      'sb-api-secret-key': process.env.SENDBLUE_SECRET_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ number, content }),
  });
}

async function sendInviteEmail(challenge, invite) {
  if (!emailConfigured()) return;
  const acceptLink = `${BASE_URL}/invite?token=${invite.token}&action=accept`;
  const declineLink = `${BASE_URL}/invite?token=${invite.token}&action=decline`;

  await resend.emails.send({
    from: 'Flick <onboarding@resend.dev>',
    to: invite.email,
    subject: `${challenge.createdBy} challenged you on Flick 🎯`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
        <h2>You've been challenged!</h2>
        <p><strong>${challenge.createdBy}</strong> wants you to join:</p>
        <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0">
          <h3 style="margin:0 0 8px">${challenge.name}</h3>
          ${challenge.description ? `<p style="color:#555;margin:0 0 8px">${challenge.description}</p>` : ''}
          <p style="margin:0">Stake: <strong>$${challenge.stakePerPerson}</strong> per person</p>
          <p style="margin:4px 0 0">Deadline: <strong>${new Date(challenge.deadline).toLocaleString()}</strong></p>
        </div>
        <p>Proof is always a photo. Accept to join, decline to pass.</p>
        <div style="margin-top:16px;display:flex;gap:12px">
          <a href="${acceptLink}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">Accept →</a>
          <a href="${declineLink}" style="background:#f0f0f0;color:#111;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-left:12px">Decline</a>
        </div>
        <p style="color:#aaa;font-size:12px;margin-top:24px">Flick — Bet on yourself.</p>
      </div>`,
  });
}

// List challenges
app.get('/api/challenges', (req, res) => {
  const db = readDB();
  res.json(db.challenges);
});

// Get one challenge
app.get('/api/challenges/:id', (req, res) => {
  const db = readDB();
  const c = db.challenges.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});

// List users
app.get('/api/users', (req, res) => {
  const db = readDB();
  res.json(db.users);
});

// Register / upsert user
app.post('/api/users', (req, res) => {
  const { name, email, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const db = readDB();
  const existing = db.users.find(u => u.name === name);
  if (existing) {
    if (email) existing.email = email;
    if (phone) existing.phone = phone;
    writeDB(db);
  } else {
    db.users.push({ name, email: email || null, phone: phone || null, joinedAt: new Date().toISOString() });
    writeDB(db);
  }
  res.json({ name });
});

// Invite a friend by email or phone
app.post('/api/users/invite', async (req, res) => {
  const { email, phone, invitedBy } = req.body;
  if ((!email && !phone) || !invitedBy) return res.status(400).json({ error: 'email or phone, and invitedBy required' });

  const db = readDB();
  const existing = db.users.find(u => (email && u.email === email) || (phone && u.phone === phone));
  if (!existing) {
    db.users.push({ name: email || phone, email: email || null, phone: phone || null, joinedAt: new Date().toISOString(), pending: true });
    writeDB(db);
  }

  const inviteMsg = `${invitedBy} invited you to Flick 🎯 — bet on yourself, prove it with a photo. Join: ${BASE_URL}`;

  await Promise.allSettled([
    email && emailConfigured() ? resend.emails.send({
      from: 'Flick <onboarding@resend.dev>',
      to: email,
      subject: `${invitedBy} invited you to Flick 🎯`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
          <h2>You're invited to Flick</h2>
          <p><strong>${invitedBy}</strong> wants you to join them on Flick — the app where you bet on yourself.</p>
          <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0">
            <p style="margin:0;color:#555">Set a challenge, put money on the line, prove it with a photo. Winners take the pot.</p>
          </div>
          <a href="${BASE_URL}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:8px">Join Flick →</a>
          <p style="color:#aaa;font-size:12px;margin-top:24px">Flick — Bet on yourself.</p>
        </div>`,
    }) : null,
    phone ? sendIMessage(phone, inviteMsg) : null,
  ]);

  res.json({ ok: true });
});

// Create challenge
app.post('/api/challenges', async (req, res) => {
  const { name, description, deadline, stakePerPerson, createdBy, inviteEmails, directMembers } = req.body;
  if (!name || !deadline || !stakePerPerson || !createdBy) {
    return res.status(400).json({ error: 'name, deadline, stakePerPerson, and createdBy are required' });
  }
  const db = readDB();

  const invitations = (inviteEmails || []).map(email => ({
    email: email.trim(),
    token: uuidv4(),
    status: 'pending',
  }));

  const extraMembers = (directMembers || []).filter(m => m && m !== createdBy);

  const challenge = {
    id: uuidv4(),
    name,
    description: description || '',
    deadline,
    stakePerPerson: Number(stakePerPerson),
    createdBy,
    members: [createdBy, ...extraMembers],
    invitations,
    proofs: [],
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  db.challenges.push(challenge);

  // Notify directly-added members via email + iMessage
  for (const memberName of extraMembers) {
    const user = db.users.find(u => u.name === memberName);
    if (!user) continue;
    const challengeMsg = `${createdBy} challenged you on Flick 🎯\n"${challenge.name}" — $${challenge.stakePerPerson}/person. Deadline: ${new Date(challenge.deadline).toLocaleString()}\nOpen Flick: ${BASE_URL}`;
    Promise.allSettled([
      user.email && emailConfigured() ? resend.emails.send({
        from: 'Flick <onboarding@resend.dev>',
        to: user.email,
        subject: `${createdBy} challenged you on Flick 🎯`,
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
            <h2>You've been challenged!</h2>
            <p><strong>${createdBy}</strong> pushed a challenge directly to you:</p>
            <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0">
              <h3 style="margin:0 0 8px">${challenge.name}</h3>
              ${challenge.description ? `<p style="color:#555;margin:0 0 8px">${challenge.description}</p>` : ''}
              <p style="margin:0">Stake: <strong>$${challenge.stakePerPerson}</strong> per person</p>
              <p style="margin:4px 0 0">Deadline: <strong>${new Date(challenge.deadline).toLocaleString()}</strong></p>
            </div>
            <p>Head to Flick to submit your proof.</p>
            <a href="${BASE_URL}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin-top:8px">Open Flick →</a>
            <p style="color:#aaa;font-size:12px;margin-top:24px">Flick — Bet on yourself.</p>
          </div>`,
      }) : null,
      user.phone ? sendIMessage(user.phone, challengeMsg) : null,
    ]).catch(console.error);
  }

  writeDB(db);

  for (const invite of invitations) {
    sendInviteEmail(challenge, invite).catch(console.error);
  }

  res.json(challenge);
});

// Accept or decline invite via token
app.get('/invite', (req, res) => {
  const { token, action } = req.query;
  if (!token || !['accept', 'decline'].includes(action)) {
    return res.redirect('/?error=invalid_invite');
  }
  const db = readDB();
  let found = null;
  let invite = null;
  for (const c of db.challenges) {
    invite = (c.invitations || []).find(i => i.token === token);
    if (invite) { found = c; break; }
  }
  if (!found || !invite) return res.redirect('/?error=invite_not_found');

  invite.status = action === 'accept' ? 'accepted' : 'declined';
  if (action === 'accept' && !found.members.includes(invite.email)) {
    found.members.push(invite.email);
  }
  writeDB(db);
  res.redirect(`/?join=${found.id}&invited=${encodeURIComponent(invite.email)}&action=${action}`);
});

// Join a challenge
app.post('/api/challenges/:id/join', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });
  const db = readDB();
  const challenge = db.challenges.find(c => c.id === req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Not found' });
  if (challenge.status !== 'active') return res.status(400).json({ error: 'Challenge is no longer open' });
  if (challenge.members.includes(username)) return res.status(400).json({ error: 'Already a member' });
  challenge.members.push(username);
  writeDB(db);
  res.json(challenge);
});

// Send invite to additional emails
app.post('/api/challenges/:id/invite', async (req, res) => {
  const { emails } = req.body;
  if (!emails || !emails.length) return res.status(400).json({ error: 'emails required' });
  const db = readDB();
  const challenge = db.challenges.find(c => c.id === req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Not found' });

  const newInvites = emails.map(email => ({
    email: email.trim(),
    token: uuidv4(),
    status: 'pending',
  }));

  challenge.invitations = [...(challenge.invitations || []), ...newInvites];
  writeDB(db);

  for (const invite of newInvites) {
    sendInviteEmail(challenge, invite).catch(console.error);
  }

  res.json(challenge);
});

// Submit proof
app.post('/api/challenges/:id/proof', upload.single('photo'), (req, res) => {
  const { username } = req.body;
  if (!username || !req.file) return res.status(400).json({ error: 'username and photo required' });
  const db = readDB();
  const challenge = db.challenges.find(c => c.id === req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Not found' });
  if (!challenge.members.includes(username)) return res.status(403).json({ error: 'Not a member' });
  if (challenge.proofs.find(p => p.userId === username)) {
    return res.status(400).json({ error: 'Already submitted proof' });
  }

  const proof = {
    userId: username,
    photoUrl: `/uploads/${req.file.filename}`,
    submittedAt: new Date().toISOString(),
    votes: {},
    verified: null,
  };
  challenge.proofs.push(proof);
  if (challenge.proofs.length === challenge.members.length) challenge.status = 'voting';
  writeDB(db);
  res.json(challenge);
});

// Vote on a proof
app.post('/api/challenges/:id/vote', (req, res) => {
  const { voter, targetUser, approved } = req.body;
  if (!voter || !targetUser || approved === undefined) {
    return res.status(400).json({ error: 'voter, targetUser, and approved required' });
  }
  if (voter === targetUser) return res.status(400).json({ error: 'Cannot vote on your own proof' });

  const db = readDB();
  const challenge = db.challenges.find(c => c.id === req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Not found' });
  if (!challenge.members.includes(voter)) return res.status(403).json({ error: 'Not a member' });

  const proof = challenge.proofs.find(p => p.userId === targetUser);
  if (!proof) return res.status(404).json({ error: 'Proof not found' });

  proof.votes[voter] = approved;

  const otherMembers = challenge.members.filter(m => m !== targetUser);
  const allVoted = otherMembers.every(m => proof.votes[m] !== undefined);
  if (allVoted) {
    const approvals = Object.values(proof.votes).filter(Boolean).length;
    proof.verified = approvals > otherMembers.length / 2;
  }

  const allSettled = challenge.proofs.length === challenge.members.length &&
    challenge.proofs.every(p => p.verified !== null);
  if (allSettled) {
    const winners = challenge.proofs.filter(p => p.verified).map(p => p.userId);
    const losers = challenge.proofs.filter(p => !p.verified).map(p => p.userId);
    const totalPot = losers.length * challenge.stakePerPerson;
    const winnerShare = winners.length > 0 ? (totalPot / winners.length).toFixed(2) : 0;
    challenge.status = 'settled';
    challenge.settlement = { winners, losers, totalPot, winnerShare };
  }

  writeDB(db);
  res.json(challenge);
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Flick running at http://localhost:${PORT}`));
