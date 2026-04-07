const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      default: null,           // null for login/logout/csv_upload events
    },
    event: {
      type: String,
      enum: [
        // Anti-cheat events
        'tab_switch', 'window_blur', 'right_click', 'copy_paste',
        'visibility_change', 'fullscreen_exit', 'keyboard_shortcut',
        // System events
        'login', 'logout', 'exam_start', 'exam_submit', 'csv_upload',
      ],
      required: true,
    },
    details: {
      type: String,
      default: '',
    },
    ipAddress: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ActivityLog', activityLogSchema);
