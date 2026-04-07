const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  selectedOption: { type: Number, default: null }, // null = not answered
  isCorrect: { type: Boolean, default: false },
  marksAwarded: { type: Number, default: 0 },
});

const resultSchema = new mongoose.Schema(
  {
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    answers: [answerSchema],
    score: {
      type: Number,
      default: 0,
    },
    totalMarks: {
      type: Number,
      default: 0,
    },
    accuracy: {
      type: Number, // percentage
      default: 0,
    },
    timeTaken: {
      type: Number, // seconds
      default: 0,
    },
    questionsAttempted: {
      type: Number,
      default: 0,
    },
    correctAnswers: {
      type: Number,
      default: 0,
    },
    wrongAnswers: {
      type: Number,
      default: 0,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    autoSubmitted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Prevent duplicate results for same student/exam
resultSchema.index({ exam: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('Result', resultSchema);
