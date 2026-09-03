import mongoose from "mongoose";
import { DELIVERY_STATUS, HTTP_METHODS } from "../constants/index.js";

const deliverySchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },

    destinationIndex: {
      type: Number,
      default: 0,
    },

    destinationName: {
      type: String,
      default: "primary",
      trim: true,
    },

    status: {
      type: String,
      enum: Object.values(DELIVERY_STATUS),
      default: DELIVERY_STATUS.PENDING,
      index: true,
    },

    targetUrl: {
      type: String,
      required: true,
    },

    httpMethod: {
      type: String,
      enum: HTTP_METHODS,
      default: "POST",
    },

    attemptsCount: {
      type: Number,
      default: 0,
    },

    maxAttempts: {
      type: Number,
      default: 3,
    },

    lastAttemptAt: {
      type: Date,
      default: null,
    },

    nextRetryAt: {
      type: Date,
      default: null,
    },

    lastError: {
      type: String,
      default: null,
    },

    responseStatus: {
      type: Number,
      default: null,
    },

    responseBody: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

deliverySchema.index({ eventId: 1, destinationIndex: 1 }, { unique: true });
deliverySchema.index({ eventId: 1, status: 1 });
deliverySchema.index({ integrationId: 1, createdAt: -1 });

const Delivery = mongoose.model("Delivery", deliverySchema);

export default Delivery;
