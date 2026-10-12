import mongoose, { Schema } from "mongoose";

const ImportErrorSchema = new Schema(
  { row: { type: Number, required: true }, message: { type: String, required: true } },
  { _id: false }
);

const ImportRecordSchema = new Schema(
  {
    filename: { type: String, required: true },
    totalRows: { type: Number, required: true, default: 0 },
    importedRows: { type: Number, required: true, default: 0 },
    duplicateRows: { type: Number, required: true, default: 0 },
    errorRows: { type: Number, required: true, default: 0 },
    errors: { type: [ImportErrorSchema], default: [] },
    sqliteId: { type: Number, unique: true, sparse: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, suppressReservedKeysWarning: true }
);

export const ImportRecord =
  mongoose.models.ImportRecord ?? mongoose.model("ImportRecord", ImportRecordSchema);
