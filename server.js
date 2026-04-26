require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const DB_PATH = path.join(__dirname, 'data/db.json');
const upload = multer({ dest: 'uploads/' });

function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// List all challenges
app.get('/api/challenges', (req, res) => {
  const db = readDB();
  res.json(db.challenges);
});

// Get one challenge
app.get('/api/challenges/:id', (req, res) => {
  const db = readDB();
  const challenge = db.challenges.find(c => c.id === req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Not found' });
  res.json(challenge);
});

// Create challenge
app.post('/api/challenges', (req, res) => {
  const { name, description, deadline, stakePerPerson, createdBy, members } = req.body;
  if (!name || !deadline || !stakePerPerson || !createdBy) {
    return res.status(400).json({ error: 'name, deadline, stakePerPerson, and createdBy are required' });
  }
  const db = readDB();
  const allMembers = [...new Set([createdBy, ...(members || [])])];
  const challenge = {
    id: uuidv4(),
    name,
    description: description || '',
    deadline,
    stakePerPerson: Number(stakePerPerson),
    createdBy,
    members: allMembers,
    proofs: [],
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  db.challenges.push(challenge);
  writeDB(db);
  res.json(challenge);
});

// Join challenge
app.post('/api/challenges/:id/join', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });
  const db = readDB();
  const challenge = db.challenges.find(c => c.id === req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Not found' });
  if (challenge.status !== 'active') return res.status(400).json({ error: 'Challenge is no longer active' });
  if (!challenge.members.includes(username)) challenge.members.push(username);
  writeDB(db);
  res.json(challenge);
});

// Submit proof (photo)
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

  // Move to voting if all members submitted
  if (challenge.proofs.length === challenge.members.length) {
    challenge.status = 'voting';
  }

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

  // Check if all votes are in for this proof
  const otherMembers = challenge.members.filter(m => m !== targetUser);
  const allVoted = otherMembers.every(m => proof.votes[m] !== undefined);
  if (allVoted) {
    const approvals = Object.values(proof.votes).filter(Boolean).length;
    proof.verified = approvals > otherMembers.length / 2;
  }

  // Auto-settle if all proofs have verdicts
  const allVerified = challenge.proofs.length === challenge.members.length &&
    challenge.proofs.every(p => p.verified !== null);
  if (allVerified) {
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
