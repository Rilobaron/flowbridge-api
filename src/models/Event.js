import mongoose from "mongoose";
import { EVENT_STATUS } from "../constants/index.js";

const eventSchema = new mongoose.Schema(
  {
    integrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Integration",
      default: null,
      index: true,
    },

    source: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    externalId: {
      type: String,
      default: null,
      trim: true,
    },

    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
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

    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    transformedPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    status: {
      type: String,
      enum: Object.values(EVENT_STATUS),
      default: EVENT_STATUS.RECEIVED,
      index: true,
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

// Índice composto único para idempotência (apenas quando integrationId e idempotencyKey estiverem preenchidos)
eventSchema.index(
  { integrationId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      integrationId: { $type: "objectId" },
      idempotencyKey: { $type: "string" },
    },
  }
);

// Índices para consultas e agregações rápidas
eventSchema.index({ status: 1, createdAt: -1 });
eventSchema.index({ integrationId: 1, createdAt: -1 });

const Event = mongoose.model("Event", eventSchema);

export default Event;