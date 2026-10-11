import type { Metadata } from "next";
import { Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "Terms for using the InsightFlow demonstration.",
};

export default function TermsPage() {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">Legal</p>
      <h1 className="font-display font-semibold text-3xl tracking-tight mt-1 mb-6">Terms and Conditions</h1>
      <Card>
        <div className="px-6 py-6 text-[15px] leading-relaxed space-y-4 max-w-3xl">
          <p className="text-sm text-muted border border-warn/40 bg-warn-wash rounded-md px-3 py-2">
            Draft for a hackathon demonstration. It makes no claim of legal compliance or certification and has not
            been reviewed by a lawyer. Obtain legal review before production use.
          </p>
          <section>
            <h2 className="font-display font-semibold text-lg">What this is</h2>
            <p>
              InsightFlow is a demonstration business-intelligence tool built for the Build Battle 2026 hackathon. It
              analyzes customer feedback that you import or submit, and its outputs are analytical predictions and
              heuristics, not verified facts or professional advice.
            </p>
          </section>
          <section>
            <h2 className="font-display font-semibold text-lg">Acceptable use</h2>
            <p>
              Import only feedback you have the right to process. Do not upload personal data, credentials, or
              unlawful content. You are responsible for the data you import and for decisions you make from the
              analysis.
            </p>
          </section>
          <section>
            <h2 className="font-display font-semibold text-lg">No warranties</h2>
            <p>
              The application is provided as-is, without warranties of accuracy, availability, fitness for a
              particular purpose, or compliance with any law or standard. Sentiment labels, topics, priority scores,
              and recommendations are estimates derived from your data and must be reviewed by a human before action.
            </p>
          </section>
          <section>
            <h2 className="font-display font-semibold text-lg">Liability</h2>
            <p>
              To the maximum extent permitted by law, the authors are not liable for decisions made using this
              demonstration or for loss arising from imported data, third-party services (OpenAI, Adaption), or
              hosting providers.
            </p>
          </section>
          <section>
            <h2 className="font-display font-semibold text-lg">Changes</h2>
            <p>The operator may modify or discontinue this demonstration at any time without notice.</p>
          </section>
        </div>
      </Card>
    </>
  );
}
