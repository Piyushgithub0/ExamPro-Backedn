const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { uploadBulk, uploadImage } = require('../middleware/upload');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Result = require('../models/Result');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const { parseCSV, parseXML, cleanFile } = require('../utils/bulkUpload');
const path = require('path');

router.use(protect, requireRole('teacher', 'admin'));

// ─── Exam Management ──────────────────────────────────────────────────────────

// GET /api/teacher/exams
router.get('/exams', async (req, res) => {
  try {
    const exams = await Exam.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 });
    res.json({ exams });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/teacher/exams/:id
router.get('/exams/:id', async (req, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.id, createdBy: req.user._id })
      .populate('presentStudents', 'name email department rollNumber');
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    // Get auto-eligible student count
    const eligibleCount = await User.countDocuments({
      role: 'student', isActive: true,
      department: exam.department, year: exam.year, semester: exam.semester,
    });

    res.json({ exam, eligibleStudentCount: eligibleCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/teacher/exams — requires department, year, semester
router.post('/exams', async (req, res) => {
  try {
    const { title, subject, description, duration, department, year, semester,
            scheduledAt, expiresAt, shuffleQuestions, shuffleOptions } = req.body;

    if (!department || !year || !semester) {
      return res.status(400).json({ message: 'Department, year, and semester are required' });
    }

    const exam = await Exam.create({
      title, subject, description, duration,
      department, year: parseInt(year), semester: parseInt(semester),
      scheduledAt: scheduledAt || null,
      expiresAt: expiresAt || null,
      shuffleQuestions: shuffleQuestions !== false,
      shuffleOptions: shuffleOptions !== false,
      createdBy: req.user._id,
      status: 'draft',
    });
    res.status(201).json({ exam });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/teacher/exams/:id
router.put('/exams/:id', async (req, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const fields = ['title', 'subject', 'description', 'duration', 'department', 'year', 'semester',
                    'scheduledAt', 'expiresAt', 'shuffleQuestions', 'shuffleOptions', 'status'];
    fields.forEach((f) => { if (req.body[f] !== undefined) exam[f] = req.body[f]; });

    await exam.save();
    res.json({ exam });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/teacher/exams/:id
router.delete('/exams/:id', async (req, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    await Question.deleteMany({ exam: exam._id });
    await exam.deleteOne();
    res.json({ message: 'Exam deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Eligible Students (auto-computed) ────────────────────────────────────────

// GET /api/teacher/exams/:id/eligible-students
router.get('/exams/:id/eligible-students', async (req, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const students = await User.find({
      role: 'student', isActive: true,
      department: exam.department,
      year: exam.year,
      semester: exam.semester,
    }).select('name email department rollNumber year semester');

    const excludedIds = (exam.excludedStudents || []).map(id => id.toString());

    const enriched = students.map(s => ({
      ...s.toObject(),
      excluded: excludedIds.includes(s._id.toString()),
    }));

    res.json({ students: enriched, count: students.length, excludedCount: excludedIds.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/teacher/exams/:id/exclude-student — remove student from eligibility
router.post('/exams/:id/exclude-student', async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ message: 'studentId is required' });

    const exam = await Exam.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    if (!exam.excludedStudents.map(String).includes(studentId)) {
      exam.excludedStudents.push(studentId);
      await exam.save();
    }
    res.json({ message: 'Student excluded', excludedStudents: exam.excludedStudents });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/teacher/exams/:id/include-student — re-add student to eligibility
router.post('/exams/:id/include-student', async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ message: 'studentId is required' });

    const exam = await Exam.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    exam.excludedStudents = exam.excludedStudents.filter(id => id.toString() !== studentId);
    await exam.save();
    res.json({ message: 'Student included', excludedStudents: exam.excludedStudents });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Questions ────────────────────────────────────────────────────────────────

// GET /api/teacher/exams/:id/questions
router.get('/exams/:id/questions', async (req, res) => {
  try {
    const questions = await Question.find({ exam: req.params.id }).sort({ order: 1 });
    res.json({ questions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/teacher/exams/:id/questions — add single question
router.post('/exams/:id/questions', uploadImage.fields([
  { name: 'questionImage', maxCount: 1 },
  { name: 'optionImages', maxCount: 6 },
]), async (req, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    let { questionText, options, correctOption, marks } = req.body;
    if (typeof options === 'string') options = JSON.parse(options);

    const questionImage = req.files?.questionImage?.[0]
      ? `/uploads/images/${req.files.questionImage[0].filename}` : null;

    const optionImages = req.files?.optionImages || [];
    options = options.map((opt, i) => ({
      text: typeof opt === 'string' ? opt : opt.text,
      image: optionImages[i] ? `/uploads/images/${optionImages[i].filename}` : (opt.image || null),
    }));

    const count = await Question.countDocuments({ exam: req.params.id });
    const question = await Question.create({
      exam: req.params.id, questionText, questionImage, options,
      correctOption: parseInt(correctOption), marks: parseFloat(marks) || 1, order: count,
    });

    exam.totalMarks = (exam.totalMarks || 0) + parseFloat(marks || 1);
    await exam.save();

    res.status(201).json({ question });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/teacher/exams/:id/questions/bulk
router.post('/exams/:id/questions/bulk', uploadBulk.single('file'), async (req, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    let parsed = [];

    if (ext === '.csv') parsed = parseCSV(req.file.path);
    else if (ext === '.xml') parsed = await parseXML(req.file.path);
    else return res.status(400).json({ message: 'Only CSV or XML files are supported' });

    const count = await Question.countDocuments({ exam: req.params.id });
    const questions = await Question.insertMany(
      parsed.map((q, i) => ({ ...q, exam: req.params.id, order: count + i }))
    );

    const totalAdded = parsed.reduce((sum, q) => sum + (q.marks || 1), 0);
    exam.totalMarks = (exam.totalMarks || 0) + totalAdded;
    await exam.save();

    cleanFile(req.file.path);
    res.status(201).json({ inserted: questions.length, questions });
  } catch (err) {
    if (req.file) cleanFile(req.file.path);
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/teacher/questions/:id
router.put('/questions/:id', async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found' });
    const fields = ['questionText', 'options', 'correctOption', 'marks', 'questionImage'];
    fields.forEach((f) => { if (req.body[f] !== undefined) question[f] = req.body[f]; });
    await question.save();
    res.json({ question });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/teacher/questions/:id
router.delete('/questions/:id', async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found' });
    const exam = await Exam.findById(question.exam);
    if (exam) {
      exam.totalMarks = Math.max(0, (exam.totalMarks || 0) - (question.marks || 0));
      await exam.save();
    }
    await question.deleteOne();
    res.json({ message: 'Question deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Students ─────────────────────────────────────────────────────────────────

// GET /api/teacher/students
router.get('/students', async (req, res) => {
  try {
    const students = await User.find({ role: 'student', isActive: true })
      .select('name email department year semester rollNumber');
    res.json({ students });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Results + Analytics ──────────────────────────────────────────────────────

// GET /api/teacher/exams/:id/results
router.get('/exams/:id/results', async (req, res) => {
  try {
    const results = await Result.find({ exam: req.params.id })
      .populate('student', 'name email department rollNumber year semester')
      .sort({ score: -1 });

    const scores = results.map((r) => r.score);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const highest = scores.length ? Math.max(...scores) : 0;
    const lowest = scores.length ? Math.min(...scores) : 0;

    res.json({ results, analytics: { average: avg.toFixed(2), highest, lowest, total: results.length } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/teacher/exams/:id/cheat-logs
router.get('/exams/:id/cheat-logs', async (req, res) => {
  try {
    const logs = await ActivityLog.find({ exam: req.params.id })
      .populate('user', 'name email department rollNumber')
      .sort({ timestamp: -1 });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/teacher/analytics — per-subject analytics
router.get('/analytics', async (req, res) => {
  try {
    const exams = await Exam.find({ createdBy: req.user._id }).select('_id subject department');
    const examIds = exams.map(e => e._id);

    const results = await Result.find({ exam: { $in: examIds } })
      .populate('exam', 'subject department');

    const subjectStats = {};
    results.forEach(r => {
      const subj = r.exam?.subject || 'Unknown';
      if (!subjectStats[subj]) subjectStats[subj] = { subject: subj, count: 0, totalScore: 0, totalMarks: 0 };
      subjectStats[subj].count++;
      subjectStats[subj].totalScore += r.score;
      subjectStats[subj].totalMarks += r.totalMarks;
    });

    const analytics = Object.values(subjectStats).map(s => ({
      subject: s.subject,
      students: s.count,
      avgAccuracy: s.totalMarks > 0 ? ((s.totalScore / s.totalMarks) * 100).toFixed(2) : 0,
    }));

    res.json({ analytics });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/teacher/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const [upcoming, ongoing, completed] = await Promise.all([
      Exam.countDocuments({ createdBy: req.user._id, status: 'scheduled', scheduledAt: { $gt: now } }),
      Exam.countDocuments({ createdBy: req.user._id, status: 'active' }),
      Exam.countDocuments({ createdBy: req.user._id, status: 'completed' }),
    ]);

    const recentExams = await Exam.find({ createdBy: req.user._id }).sort({ createdAt: -1 }).limit(5);
    res.json({ upcoming, ongoing, completed, recentExams });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
