import mongoose, { Schema } from "mongoose";

const AnalysisRunSchema = new Schema(
  {
    method: { type: String, required: true },
    totalUnique: { type: Number, required: true, default: 0 },
    succeeded: { type: Number, required: true, default: 0 },
    failed: { type: Number, required: true, default: 0 },
    rowsUpdated: { type: Number, required: true, default: 0 },
    detail: { type: Schema.Types.Mixed, default: {} },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    sqliteId: { type: Number, unique: true, sparse: true },
  },
  { versionKey: false }
);

export const AnalysisRun =
  mongoose.models.AnalysisRun ?? mongoose.model("AnalysisRun", AnalysisRunSchema);
