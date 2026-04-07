const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Result = require('../models/Result');
const ActivityLog = require('../models/ActivityLog');
const AutoSave = require('../models/AutoSave');
const { shuffleExamQuestions } = require('../utils/shuffle');

router.use(protect, requireRole('student'));

// ─── Exam Discovery (Dynamic Filtering by Profile) ───────────────────────────

// GET /api/student/exams — auto-filtered by student's department + year + semester
router.get('/exams', async (req, res) => {
  try {
    const student = req.user;

    // Build filter based on student profile
    const filter = {
      status: { $in: ['scheduled', 'active'] },
    };

    // Only show exams matching student's academic profile
    if (student.department) filter.department = student.department;
    if (student.year) filter.year = student.year;
    if (student.semester) filter.semester = student.semester;

    const exams = await Exam.find(filter)
      .populate('createdBy', 'name')
      .select('-activeStudents')
      .sort({ scheduledAt: 1 });

    // Check if already submitted
    const results = await Result.find({ student: student._id }).select('exam');
    const submittedExamIds = results.map((r) => r.exam.toString());

    const enriched = exams.map((e) => ({
      ...e.toObject(),
      alreadySubmitted: submittedExamIds.includes(e._id.toString()),
    }));

    res.json({ exams: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/student/exams/:id/start — directly start an eligible exam (no access code)
router.post('/exams/:id/start', async (req, res) => {
  try {
    const student = req.user;
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    if (exam.status !== 'active') {
      return res.status(400).json({ message: `Exam is not active (status: ${exam.status})` });
    }

    // Verify student eligibility (department + year + semester match)
    if (student.department && exam.department && student.department !== exam.department) {
      return res.status(403).json({ message: 'You are not eligible for this exam (department mismatch)' });
    }
    if (student.year && exam.year && student.year !== exam.year) {
      return res.status(403).json({ message: 'You are not eligible for this exam (year mismatch)' });
    }
    if (student.semester && exam.semester && student.semester !== exam.semester) {
      return res.status(403).json({ message: 'You are not eligible for this exam (semester mismatch)' });
    }

    // Check if teacher excluded this student
    if ((exam.excludedStudents || []).map(String).includes(student._id.toString())) {
      return res.status(403).json({ message: 'You have been excluded from this exam by the teacher' });
    }

    // Check if already submitted
    const existing = await Result.findOne({ exam: exam._id, student: student._id });
    if (existing) return res.status(400).json({ message: 'You have already submitted this exam' });

    // Track active student
    const alreadyActive = exam.activeStudents.find(
      (s) => s.student.toString() === student._id.toString()
    );
    if (!alreadyActive) {
      exam.activeStudents.push({ student: student._id, joinedAt: new Date(), lastSeen: new Date() });
      await exam.save();
    }

    // Log exam start
    await ActivityLog.create({
      user: student._id, exam: exam._id,
      event: 'exam_start',
      details: `Started exam: ${exam.title}`,
    }).catch(() => {});

    res.json({ exam: { _id: exam._id, title: exam.title, subject: exam.subject, duration: exam.duration, department: exam.department } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/student/exams/:id/questions — shuffled questions (no correct answers)
router.get('/exams/:id/questions', async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    if (exam.status !== 'active') return res.status(400).json({ message: 'Exam is not active' });

    const questions = await Question.find({ exam: req.params.id }).sort({ order: 1 });
    const shuffled = shuffleExamQuestions(questions, exam.shuffleQuestions, exam.shuffleOptions);

    // Remove correct option from response
    const sanitized = shuffled.map(({ correctOption, ...rest }) => rest);

    // Get autosave if exists
    const autosave = await AutoSave.findOne({ exam: req.params.id, student: req.user._id });

    // Update lastSeen
    await Exam.updateOne(
      { _id: req.params.id, 'activeStudents.student': req.user._id },
      { $set: { 'activeStudents.$.lastSeen': new Date() } }
    );

    res.json({
      exam: { _id: exam._id, title: exam.title, duration: exam.duration, totalMarks: exam.totalMarks },
      questions: sanitized,
      savedAnswers: autosave?.answers || [],
      startedAt: autosave?.startedAt || new Date(),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Auto-Save ────────────────────────────────────────────────────────────────

router.post('/exams/:id/autosave', async (req, res) => {
  try {
    const { answers } = req.body;
    await AutoSave.findOneAndUpdate(
      { exam: req.params.id, student: req.user._id },
      { exam: req.params.id, student: req.user._id, answers, lastSaved: new Date() },
      { upsert: true, new: true }
    );
    res.json({ message: 'Saved' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Submit Exam ──────────────────────────────────────────────────────────────

router.post('/exams/:id/submit', async (req, res) => {
  try {
    const { answers, timeTaken, autoSubmitted = false } = req.body;

    const existing = await Result.findOne({ exam: req.params.id, student: req.user._id });
    if (existing) return res.status(400).json({ message: 'Already submitted', result: existing });

    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const questions = await Question.find({ exam: req.params.id });
    const questionMap = {};
    questions.forEach((q) => { questionMap[q._id.toString()] = q; });

    let score = 0, correctAnswers = 0, wrongAnswers = 0, questionsAttempted = 0;

    const answerRecords = answers.map((a) => {
      const q = questionMap[a.question?.toString()];
      if (!q) return { question: a.question, selectedOption: null, isCorrect: false, marksAwarded: 0 };

      const attempted = a.selectedOption !== null && a.selectedOption !== undefined;
      if (attempted) questionsAttempted++;

      const isCorrect = attempted && a.selectedOption === q.correctOption;
      const marksAwarded = isCorrect ? q.marks : 0;

      if (isCorrect) correctAnswers++;
      else if (attempted) wrongAnswers++;

      score += marksAwarded;
      return { question: q._id, selectedOption: a.selectedOption ?? null, isCorrect, marksAwarded };
    });

    const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
    const accuracy = totalMarks > 0 ? ((score / totalMarks) * 100).toFixed(2) : 0;

    const result = await Result.create({
      exam: req.params.id, student: req.user._id, answers: answerRecords,
      score, totalMarks, accuracy: parseFloat(accuracy),
      timeTaken: timeTaken || 0, questionsAttempted, correctAnswers, wrongAnswers, autoSubmitted,
    });

    // Remove from activeStudents
    await Exam.updateOne(
      { _id: req.params.id },
      { $pull: { activeStudents: { student: req.user._id } } }
    );

    // Clear autosave
    await AutoSave.deleteOne({ exam: req.params.id, student: req.user._id });

    // Log exam submit
    await ActivityLog.create({
      user: req.user._id, exam: req.params.id,
      event: 'exam_submit',
      details: `Score: ${score}/${totalMarks} (${accuracy}%)${autoSubmitted ? ' [auto-submitted]' : ''}`,
    }).catch(() => {});

    res.status(201).json({ result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Results ──────────────────────────────────────────────────────────────────

router.get('/results', async (req, res) => {
  try {
    const results = await Result.find({ student: req.user._id })
      .populate('exam', 'title subject duration department year semester')
      .sort({ submittedAt: -1 });
    res.json({ results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/results/:id', async (req, res) => {
  try {
    const result = await Result.findOne({ _id: req.params.id, student: req.user._id })
      .populate('exam', 'title subject duration totalMarks department')
      .populate('answers.question', 'questionText options correctOption marks');
    if (!result) return res.status(404).json({ message: 'Result not found' });
    res.json({ result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Activity Log ─────────────────────────────────────────────────────────────

router.post('/activity-log', async (req, res) => {
  try {
    const { examId, event, details } = req.body;
    if (!examId || !event) return res.status(400).json({ message: 'examId and event required' });

    const log = await ActivityLog.create({
      user: req.user._id,
      exam: examId,
      event,
      details: details || '',
    });

    res.status(201).json({ log });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  try {
    const student = req.user;
    const results = await Result.find({ student: student._id }).populate('exam', 'title subject department');

    // Auto-filter available exams by student profile
    const filter = { status: 'active' };
    if (student.department) filter.department = student.department;
    if (student.year) filter.year = student.year;
    if (student.semester) filter.semester = student.semester;

    const available = await Exam.find(filter).select('title subject duration accessCode department year semester');

    const upcomingFilter = { status: 'scheduled', scheduledAt: { $gt: new Date() } };
    if (student.department) upcomingFilter.department = student.department;
    if (student.year) upcomingFilter.year = student.year;
    if (student.semester) upcomingFilter.semester = student.semester;

    const upcoming = await Exam.find(upcomingFilter).select('title subject scheduledAt duration department');

    res.json({
      results,
      available,
      upcoming,
      profile: {
        department: student.department,
        year: student.year,
        semester: student.semester,
        rollNumber: student.rollNumber,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
