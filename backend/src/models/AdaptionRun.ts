import mongoose, { Schema } from "mongoose";

const AdaptionRunSchema = new Schema(
  {
    operation: { type: String, required: true },
    mode: { type: String, required: true },
    inputRows: { type: Number, required: true, default: 0 },
    status: { type: String, required: true, default: "completed" },
    summary: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
    sqliteId: { type: Number, unique: true, sparse: true },
  },
  { versionKey: false }
);

export const AdaptionRun =
  mongoose.models.AdaptionRun ?? mongoose.model("AdaptionRun", AdaptionRunSchema);
