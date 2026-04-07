const mongoose = require('mongoose');

const autoSaveSchema = new mongoose.Schema(
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
    answers: [
      {
        question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
        selectedOption: { type: Number, default: null },
      },
    ],
    startedAt: {
      type: Date,
      default: Date.now,
    },
    lastSaved: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

autoSaveSchema.index({ exam: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('AutoSave', autoSaveSchema);
