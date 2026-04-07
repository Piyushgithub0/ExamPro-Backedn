const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ['admin', 'teacher', 'student'],
      default: 'student',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    profileImage: {
      type: String,
      default: null,
    },

    // ─── Student-specific fields ──────────────────────────────
    department: { type: String, trim: true, default: null },   // e.g. "IT", "Computer Science"
    year:       { type: Number, default: null },               // 1-4
    semester:   { type: Number, default: null },               // 1-8
    rollNumber: { type: String, trim: true, default: null },   // e.g. "CS2024001"

    // ─── Teacher-specific fields ──────────────────────────────
    // A teacher can be linked to multiple departments and courses/subjects
    departments: [{ type: String, trim: true }],               // ["IT", "CS"]
    subjects:    [{ type: String, trim: true }],               // ["CN", "Java", "DBMS"]
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
