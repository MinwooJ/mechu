import Link from "next/link";

type FlowHeaderProps = {
  overlay?: boolean;
};

export default function FlowHeader({ overlay = false }: FlowHeaderProps) {
  return (
    <header className={`flow-header${overlay ? " overlay" : ""}`}>
      <Link href="/onboarding" className="flow-brand" aria-label="홈으로 이동">
        <img src="/mechu_icon_512x512.png" alt="" className="flow-brand-icon" aria-hidden />
        <span className="flow-brand-wordmark">
          <img src="/brand/mechu_logo.png" alt="mechu" className="flow-brand-image" />
        </span>
      </Link>

      <nav className="flow-nav">
        <Link href="/onboarding">Home</Link>
      </nav>
    </header>
  );
}
