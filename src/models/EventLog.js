import mongoose from "mongoose";
import { LOG_LEVELS } from "../constants/index.js";

const eventLogSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    integrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Integration",
      default: null,
      index: true,
    },

    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      default: null,
      index: true,
    },

    correlationId: {
      type: String,
      default: null,
      index: true,
    },

    requestId: {
      type: String,
      default: null,
    },

    level: {
      type: String,
      enum: Object.values(LOG_LEVELS),
      default: LOG_LEVELS.INFO,
      index: true,
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

eventLogSchema.index({ eventId: 1, createdAt: 1 });
eventLogSchema.index({ integrationId: 1, createdAt: -1 });

const EventLog = mongoose.model("EventLog", eventLogSchema);

export default EventLog;