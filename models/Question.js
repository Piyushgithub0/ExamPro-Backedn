const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  text: { type: String, default: '' },
  image: { type: String, default: null },
});

const questionSchema = new mongoose.Schema(
  {
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
    },
    questionText: {
      type: String,
      required: [true, 'Question text is required'],
    },
    questionImage: {
      type: String,
      default: null,
    },
    options: {
      type: [optionSchema],
      validate: {
        validator: (v) => v.length >= 2 && v.length <= 6,
        message: 'Each question must have between 2 and 6 options',
      },
    },
    correctOption: {
      type: Number, // index of correct option (0-based)
      required: [true, 'Correct option index is required'],
    },
    marks: {
      type: Number,
      required: [true, 'Marks are required'],
      default: 1,
      min: 0,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Question', questionSchema);
