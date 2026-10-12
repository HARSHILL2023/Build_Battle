import mongoose, { Schema } from "mongoose";

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// Local workspace accounts. Passwords live only as bcrypt hashes
// (passwordHash, never selected by default). Roles are server-side only:
// clients can never set or escalate their own role.
const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: "user", required: true },
    // Read-only demo visitors (hackathon "Try Live Demo"). Set only by the
    // server when provisioning the shared demo account; never from clients.
    isDemo: { type: Boolean, default: false, required: true },
    failedAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

export type UserDoc = mongoose.InferSchemaType<typeof UserSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const User = mongoose.models.User ?? mongoose.model("User", UserSchema);
