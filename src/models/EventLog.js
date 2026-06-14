import mongoose from "mongoose";

const eventLogSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    level: {
      type: String,
      enum: ["info", "success", "warning", "error"],
      default: "info",
    },

    step: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    attempt: {
      type: Number,
      default: 0,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const EventLog = mongoose.model("EventLog", eventLogSchema);

export default EventLog;