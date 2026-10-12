import mongoose, { Schema } from "mongoose";
import { ALLOWED_CATEGORIES } from "../utils/csv.js";

// Numeric API id. Migrated rows keep their SQLite id; new rows take the
// next sequence value. Never the Mongo _id, which stays internal.
const FeedbackSchema = new Schema(
  {
    reviewText: { type: String, required: true, maxlength: 2000 },
    sourceCategory: { type: String, required: true, enum: ALLOWED_CATEGORIES },
    normHash: { type: String, required: true, index: true },
    sentiment: { type: String, enum: ["positive", "neutral", "negative"], default: null },
    sentimentMethod: { type: String, default: null },
    topics: { type: [String], default: [] },
    analysisStatus: {
      type: String,
      enum: ["pending", "analyzed", "failed"],
      default: "pending",
      index: true,
    },
    source: { type: String, enum: ["manual", "csv", "sample"], default: "manual" },
    importId: { type: Schema.Types.ObjectId, ref: "ImportRecord", default: null },
    sqliteId: { type: Number, unique: true, sparse: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

FeedbackSchema.index({ sentiment: 1 });
FeedbackSchema.index({ sourceCategory: 1 });
FeedbackSchema.index({ topics: 1 });

export type FeedbackDoc = mongoose.InferSchemaType<typeof FeedbackSchema> & { _id: mongoose.Types.ObjectId };
export const Feedback = mongoose.models.Feedback ?? mongoose.model("Feedback", FeedbackSchema);
