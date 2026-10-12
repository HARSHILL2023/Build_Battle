import mongoose, { Schema } from "mongoose";

const CounterSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false }
);

export const Counter = mongoose.models.Counter ?? mongoose.model("Counter", CounterSchema);
