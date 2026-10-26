import { INSIGHT_DISCLAIMER } from "@maia/contracts";

interface DisclaimerProps {
  /**
   * The wording of a generated insight belongs to the backend, so the panel passes the stored
   * disclaimer. The constant is the fallback used by the static footer.
   */
  text?: string;
  className?: string;
}

/**
 * The non-diagnostic notice. It is repeated in the footer and in every insight card on purpose:
 * the reader must meet it before and after the content, not only next to it.
 */
export function Disclaimer({ text = INSIGHT_DISCLAIMER, className }: DisclaimerProps) {
  const classNames = className ? `disclaimer ${className}` : "disclaimer";
  return (
    <p className={classNames} role="note">
      {text}
    </p>
  );
}
