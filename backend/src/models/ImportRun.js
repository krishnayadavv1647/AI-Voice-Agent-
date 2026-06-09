import mongoose from "mongoose";

const importRunSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    fileName: { type: String, required: true },
    totalRows: { type: Number, default: 0 },
    validRows: { type: Number, default: 0 },
    invalidRows: { type: Number, default: 0 },
    importedRows: { type: Number, default: 0 },
    skippedRows: { type: Number, default: 0 },
    status: { type: String, enum: ["uploaded", "validated", "imported", "failed"], default: "uploaded", index: true },
    errors: [String]
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

export default mongoose.model("ImportRun", importRunSchema);
