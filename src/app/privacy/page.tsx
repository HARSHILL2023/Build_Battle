import type { Metadata } from "next";
import { Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How InsightFlow handles feedback data and integrations.",
};

export default function PrivacyPage() {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">Legal</p>
      <h1 className="font-display font-semibold text-3xl tracking-tight mt-1 mb-6">Privacy Policy</h1>
      <Card>
        <div className="px-6 py-6 text-[15px] leading-relaxed space-y-4 max-w-3xl">
          <p className="text-sm text-muted border border-warn/40 bg-warn-wash rounded-md px-3 py-2">
            Draft for a hackathon demonstration. It describes actual data handling but has not been reviewed by a
            lawyer. Obtain legal review before production use.
          </p>
          <section>
            <h2 className="font-display font-semibold text-lg">What InsightFlow stores</h2>
            <p>
              Feedback text and its source category, submitted through the in-app form or imported from CSV files.
              Analysis outputs derived from that feedback: sentiment labels, topic tags, duplicate hashes, generated
              issues, and import logs. The application does not collect customer names, accounts, or contact details
              because the supported dataset does not contain them.
            </p>
          </section>
          <section>
            <h2 className="font-display font-semibold text-lg">Where data lives</h2>
            <p>
              Records are stored in the application database (a SQLite file on the application server by default).
              Data is not sold, not used for advertising, and not shared with third parties except for the two
              integrations described below, which only run when the operator configures them.
            </p>
          </section>
          <section>
            <h2 className="font-display font-semibold text-lg">AI analysis</h2>
            <p>
              When an OpenAI API key is configured, review texts are sent to OpenAI for sentiment and topic
              classification. When no key is configured, classification runs locally with deterministic rules and no
              data leaves the server. The active method is always shown in the interface before analysis runs.
            </p>
          </section>
          <section>
            <h2 className="font-display font-semibold text-lg">Adaption preparation</h2>
            <p>
              When an Adaption API key is configured and verified, feedback may be sent to the Adaption API for
              dataset preparation (deduplication and quality evaluation) as documented at docs.adaptionlabs.ai.
              Without a key, preparation runs locally and no data leaves the server.
            </p>
          </section>
          <section>
            <h2 className="font-display font-semibold text-lg">Your controls</h2>
            <p>
              Individual records can be deleted from the Feedback workspace. All workspace data can be deleted from
              Settings with typed confirmation. CSV exports include a guard against spreadsheet formula injection.
              There are no public share links; reports are downloaded or printed by the operator.
            </p>
          </section>
          <section>
            <h2 className="font-display font-semibold text-lg">Contact</h2>
            <p>For questions about this deployment, contact the operator who provided you access to it.</p>
          </section>
        </div>
      </Card>
    </>
  );
}
