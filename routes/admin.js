const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { uploadBulk } = require('../middleware/upload');
const User = require('../models/User');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const ActivityLog = require('../models/ActivityLog');
const { generateAccessCode } = require('../utils/helpers');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// All admin routes are protected
router.use(protect, requireRole('admin'));

// ─── CSV Student Upload ───────────────────────────────────────────────────────

// POST /api/admin/students/upload-csv
router.post('/students/upload-csv', uploadBulk.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No CSV file uploaded' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.csv') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Only CSV files are supported' });
    }

    const content = fs.readFileSync(req.file.path, 'utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let created = 0, updated = 0, errors = [];

    for (const row of records) {
      try {
        const { Name, Email, Department, Year, Semester, RollNumber } = row;

        if (!Name || !Email) {
          errors.push(`Skipped row: missing Name or Email`);
          continue;
        }

        const existing = await User.findOne({ email: Email.toLowerCase() });

        if (existing) {
          // Update existing student
          if (Department) existing.department = Department;
          if (Year) existing.year = parseInt(Year);
          if (Semester) existing.semester = parseInt(Semester);
          if (RollNumber) existing.rollNumber = RollNumber;
          existing.role = 'student';
          await existing.save();
          updated++;
        } else {
          // Create new student with default password
          const defaultPassword = RollNumber ? `${RollNumber}@123` : 'student@123';
          await User.create({
            name: Name,
            email: Email.toLowerCase(),
            password: defaultPassword,
            role: 'student',
            department: Department || null,
            year: Year ? parseInt(Year) : null,
            semester: Semester ? parseInt(Semester) : null,
            rollNumber: RollNumber || null,
          });
          created++;
        }
      } catch (err) {
        errors.push(`Error for ${row.Email || 'unknown'}: ${err.message}`);
      }
    }

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    // Log CSV upload activity
    await ActivityLog.create({
      user: req.user._id,
      event: 'csv_upload',
      details: `Uploaded CSV: ${created} created, ${updated} updated, ${errors.length} errors`,
    });

    res.json({
      message: `CSV processed: ${created} created, ${updated} updated`,
      created, updated,
      errors: errors.slice(0, 20),
      total: records.length,
    });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path).catch?.(() => {});
    res.status(500).json({ message: err.message });
  }
});

// ─── Users ────────────────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { role, search, department } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (department) filter.department = department;
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { rollNumber: { $regex: search, $options: 'i' } },
    ];

    const users = await User.find(filter).sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin/users — create a user
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role, department, year, semester, rollNumber, departments, subjects } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Name, email, password, and role are required' });
    }
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: 'Email already registered' });

    const userData = { name, email, password, role };
    if (role === 'student') {
      userData.department = department || null;
      userData.year = year ? parseInt(year) : null;
      userData.semester = semester ? parseInt(semester) : null;
      userData.rollNumber = rollNumber || null;
    }
    if (role === 'teacher') {
      userData.departments = departments || [];
      userData.subjects = subjects || [];
    }

    const user = await User.create(userData);
    res.status(201).json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  try {
    const { name, email, role, isActive, password, department, year, semester, rollNumber, departments, subjects } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    if (password) user.password = password;

    // Academic fields
    if (department !== undefined) user.department = department;
    if (year !== undefined) user.year = year ? parseInt(year) : null;
    if (semester !== undefined) user.semester = semester ? parseInt(semester) : null;
    if (rollNumber !== undefined) user.rollNumber = rollNumber;
    if (departments !== undefined) user.departments = departments;
    if (subjects !== undefined) user.subjects = subjects;

    await user.save();
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    await user.deleteOne();
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Departments ──────────────────────────────────────────────────────────────

// GET /api/admin/departments — get unique departments
router.get('/departments', async (req, res) => {
  try {
    const studentDepts = await User.distinct('department', { role: 'student', department: { $ne: null } });
    const teacherDepts = await User.distinct('departments');
    const examDepts = await Exam.distinct('department');
    const all = [...new Set([...studentDepts, ...teacherDepts.flat(), ...examDepts])].filter(Boolean).sort();
    res.json({ departments: all });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Exams ────────────────────────────────────────────────────────────────────

// GET /api/admin/exams
router.get('/exams', async (req, res) => {
  try {
    const exams = await Exam.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    res.json({ exams });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/admin/exams/:id/release-code
router.post('/exams/:id/release-code', async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    const code = generateAccessCode();
    exam.accessCode = code;
    await exam.save();
    res.json({ accessCode: code, exam });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/exams/:id/status
router.put('/exams/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['draft', 'scheduled', 'active', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const exam = await Exam.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    res.json({ exam });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Monitoring ───────────────────────────────────────────────────────────────

router.get('/monitoring', async (req, res) => {
  try {
    const activeExams = await Exam.find({ status: 'active' })
      .populate('createdBy', 'name')
      .populate('activeStudents.student', 'name email department rollNumber');

    const summary = activeExams.map((exam) => ({
      examId: exam._id,
      title: exam.title,
      subject: exam.subject,
      department: exam.department,
      teacher: exam.createdBy?.name,
      activeStudentCount: exam.activeStudents.length,
      activeStudents: exam.activeStudents,
    }));

    res.json({ activeExams: summary });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Cheat Logs ───────────────────────────────────────────────────────────────

router.get('/cheat-logs', async (req, res) => {
  try {
    const { examId } = req.query;
    const filter = { event: { $in: ['tab_switch','window_blur','right_click','copy_paste','visibility_change','fullscreen_exit','keyboard_shortcut'] } };
    if (examId) filter.exam = examId;

    const logs = await ActivityLog.find(filter)
      .populate('user', 'name email department rollNumber')
      .populate('exam', 'title subject department')
      .sort({ timestamp: -1 })
      .limit(500);

    const summary = {};
    logs.forEach((log) => {
      const key = `${log.user?._id}__${log.exam?._id}`;
      if (!summary[key]) {
        summary[key] = { user: log.user, exam: log.exam, events: {}, total: 0 };
      }
      summary[key].events[log.event] = (summary[key].events[log.event] || 0) + 1;
      summary[key].total++;
    });

    res.json({ logs, summary: Object.values(summary) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Analytics ────────────────────────────────────────────────────────────────

// GET /api/admin/analytics — department-wise performance
router.get('/analytics', async (req, res) => {
  try {
    const results = await Result.find()
      .populate({ path: 'exam', select: 'title subject department year semester' })
      .populate({ path: 'student', select: 'name department year semester' });

    // Group by department
    const deptStats = {};
    results.forEach(r => {
      const dept = r.exam?.department || 'Unknown';
      if (!deptStats[dept]) deptStats[dept] = { department: dept, totalStudents: 0, totalScore: 0, totalMarks: 0, examCount: new Set() };
      deptStats[dept].totalStudents++;
      deptStats[dept].totalScore += r.score;
      deptStats[dept].totalMarks += r.totalMarks;
      deptStats[dept].examCount.add(r.exam?._id?.toString());
    });

    const analytics = Object.values(deptStats).map(d => ({
      department: d.department,
      totalStudents: d.totalStudents,
      avgAccuracy: d.totalMarks > 0 ? ((d.totalScore / d.totalMarks) * 100).toFixed(2) : 0,
      examsCount: d.examCount.size,
    }));

    res.json({ analytics });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, totalStudents, totalTeachers, totalExams, activeExams, completedExams] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: 'student' }),
        User.countDocuments({ role: 'teacher' }),
        Exam.countDocuments(),
        Exam.countDocuments({ status: 'active' }),
        Exam.countDocuments({ status: 'completed' }),
      ]);

    const departments = await User.distinct('department', { role: 'student', department: { $ne: null } });

    res.json({ totalUsers, totalStudents, totalTeachers, totalExams, activeExams, completedExams, departmentCount: departments.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
