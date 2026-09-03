import mongoose from "mongoose";

const deliveryAttemptSchema = new mongoose.Schema(
  {
    deliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
      required: true,
      index: true,
    },

    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    attemptNumber: {
      type: Number,
      required: true,
    },

    request: {
      url: { type: String, required: true },
      method: { type: String, required: true },
      headers: { type: mongoose.Schema.Types.Mixed, default: {} },
      body: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    response: {
      status: { type: Number, default: null },
      headers: { type: mongoose.Schema.Types.Mixed, default: {} },
      body: { type: mongoose.Schema.Types.Mixed, default: null },
      durationMs: { type: Number, default: 0 },
    },

    error: {
      type: String,
      default: null,
    },

    success: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

deliveryAttemptSchema.index({ deliveryId: 1, attemptNumber: 1 });
deliveryAttemptSchema.index({ eventId: 1, createdAt: -1 });

const DeliveryAttempt = mongoose.model("DeliveryAttempt", deliveryAttemptSchema);

export default DeliveryAttempt;
