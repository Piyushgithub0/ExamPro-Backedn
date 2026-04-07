const mongoose = require('mongoose');

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Exam title is required'],
      trim: true,
    },
    subject: {
      type: String,
      required: [true, 'Subject/Course is required'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ─── Academic mapping (auto-matches eligible students) ────
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    year: {
      type: Number,
      required: [true, 'Year is required'],
      min: 1,
      max: 4,
    },
    semester: {
      type: Number,
      required: [true, 'Semester is required'],
      min: 1,
      max: 8,
    },

    duration: {
      type: Number, // minutes
      required: [true, 'Duration is required'],
      min: 1,
    },
    totalMarks: {
      type: Number,
      default: 0,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    accessCode: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'active', 'completed'],
      default: 'draft',
    },
    shuffleQuestions: {
      type: Boolean,
      default: true,
    },
    shuffleOptions: {
      type: Boolean,
      default: true,
    },

    // Teacher-managed: students explicitly excluded from eligibility
    excludedStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // Students who joined this exam (for live monitoring)
    presentStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    activeStudents: [
      {
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joinedAt: { type: Date, default: Date.now },
        lastSeen: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Exam', examSchema);
