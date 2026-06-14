import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      required: true,
      trim: true,
    },

    eventType: {
      type: String,
      required: true,
      trim: true,
    },

    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    status: {
      type: String,
      enum: ["received", "processing", "success", "failed"],
      default: "received",
    },

    attempts: {
      type: Number,
      default: 0,
    },

    lastError: {
      type: String,
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Event = mongoose.model("Event", eventSchema);

export default Event;