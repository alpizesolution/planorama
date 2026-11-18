import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarBlank,
  CalendarCheck,
  ChartLineUp,
  Flag,
  GoogleLogo,
  Kanban,
  LockKey,
  Palette,
  Sparkle,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { resolveAppBaseUrl } from "@/lib/server/app-url";
import { ViewShowcase } from "./_landing/view-showcase";
import styles from "./_landing/welcome.module.css";

export const metadata: Metadata = {
  metadataBase: new URL(resolveAppBaseUrl()),
  title: "Planorama — Your whole year, in view",
  description:
    "A colorful planner that puts your calendar, tasks, habits and holidays in one place. Ten views, Google Calendar sync and a dashboard built for your day.",
  openGraph: {
    title: "Planorama — Your whole year, in view",
    description: "Calendar, tasks, habits and holidays in one colorful planner.",
    images: ["/landing/dashboard.webp"],
  },
};

const VIEW_NAMES = ["Dashboard", "Day", "Week", "Work Weeks", "Month", "Year", "Yearline", "Agenda", "Board", "Holidays"];

const FEATURES = [
  {
    icon: GoogleLogo,
    tone: "sky",
    title: "Google Calendar, two-way",
    body: "Connect your Google account and your events flow in and out. Edit in Planorama, see it in Google.",
  },
  {
    icon: UsersThree,
    tone: "purple",
    title: "Client calendars side by side",
    body: "Managing schedules for others? Add secondary accounts and see every client’s calendar in one place.",
  },
  {
    icon: ChartLineUp,
    tone: "lime",
    title: "Daily progress that counts",
    body: "Every day shows what’s done, scheduled and left, so you always know how today is really going.",
  },
  {
    icon: Sparkle,
    tone: "yellow",
    title: "Habits and streaks",
    body: "Water, stretching, reading: check in daily and watch your streaks build right on the dashboard.",
  },
  {
    icon: Flag,
    tone: "pink",
    title: "Philippine holidays built in",
    body: "Regular and special non-working days from official proclamations, with a heads-up before each one.",
  },
  {
    icon: Palette,
    tone: "orange",
    title: "Make it yours",
    body: "Color events, tasks and appointments your way, rearrange the dashboard and pick a calendar theme.",
  },
] as const;

type LandingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LandingPage({ searchParams }: LandingPageProps) {
  // The planner used to live at "/", so older bookmarks, Google OAuth return
  // links and "/?view=..." deep links still point here. Anything that carries
  // a query string belongs to the app, so forward it to /app unchanged.
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else if (value !== undefined) query.append(key, value);
  }
  const queryString = query.toString();
  if (queryString) redirect(`/app?${queryString}`);

  return (
    <div className={styles.page}>
      {/* ── Nav ── */}
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand} aria-label="Planorama">
            <span className={styles.brandMark}>
              <CalendarBlank size={20} weight="fill" />
            </span>
            <span>
              planorama<span className={styles.brandDot}>.</span>
            </span>
          </Link>
          <nav className={styles.navLinks} aria-label="Page sections">
            <a href="#views">Views</a>
            <a href="#features">Features</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <Link href="/app" className={styles.btnPrimarySm}>
            Open Planorama
          </Link>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className={styles.hero}>
          <div className={styles.heroBlobPink} aria-hidden="true" />
          <div className={styles.heroBlobYellow} aria-hidden="true" />
          <div className={styles.heroBlobSky} aria-hidden="true" />

          <div className={styles.heroCopy}>
            <span className={styles.pill}>
              <span className={styles.pillDot} /> Calendar · Tasks · Habits · Holidays
            </span>
            <h1 className={styles.heroTitle}>
              Your whole year, <span className={styles.highlight}>in view.</span>
            </h1>
            <p className={styles.heroLead}>
              Planorama is the colorful planner that brings your calendar, to-dos, daily habits and
              holidays into one bold, joyful workspace, from today’s focus to the full year ahead.
            </p>
            <div className={styles.heroCtas}>
              <Link href="/app" className={styles.btnPrimary}>
                Start planning <ArrowRight size={18} weight="bold" />
              </Link>
              <a href="#views" className={styles.btnSecondary}>
                Take the tour
              </a>
            </div>
            <ul className={styles.heroChecks}>
              <li>
                <CalendarCheck size={18} weight="bold" /> No sign-up needed to start
              </li>
              <li>
                <GoogleLogo size={18} weight="bold" /> Syncs with Google Calendar
              </li>
            </ul>
          </div>

          <div className={styles.heroVisual}>
            <div className={`${styles.browser} ${styles.heroBrowser}`}>
              <div className={styles.browserBar} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <Image
                src="/landing/dashboard.webp"
                alt="Planorama dashboard showing today's tasks, progress and habits"
                width={1600}
                height={1000}
                priority
                sizes="(max-width: 900px) 100vw, 900px"
                className={styles.browserImg}
              />
            </div>
            <div className={styles.phone}>
              <Image
                src="/landing/mobile-day.webp"
                alt="Planorama day view on a phone"
                width={780}
                height={1688}
                sizes="220px"
                className={styles.phoneImg}
              />
            </div>
            <div className={styles.floatCard} aria-hidden="true">
              <span className={styles.floatEmoji}>
                <ChartLineUp size={20} weight="bold" />
              </span>
              <div>
                <strong>3 of 10 done</strong>
                <span>Today’s progress</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── View marquee ── */}
        <section className={styles.marquee} aria-label="Ten ways to see your plans">
          <div className={styles.marqueeTrack}>
            {[...VIEW_NAMES, ...VIEW_NAMES].map((name, i) => (
              <span key={`${name}-${i}`} className={styles.marqueeItem} aria-hidden={i >= VIEW_NAMES.length}>
                {name} <span className={styles.marqueeStar}>✳</span>
              </span>
            ))}
          </div>
        </section>

        {/* ── Views showcase ── */}
        <section id="views" className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>Ten views, one plan</span>
            <h2 className={styles.sectionTitle}>Zoom from this hour to this year.</h2>
            <p className={styles.sectionLead}>
              Day, Week, Work Weeks, Month, Year, Yearline, Agenda and Board all read the same plan, so
              switching views never means switching apps.
            </p>
          </div>
          <ViewShowcase />
        </section>

        {/* ── Features bento ── */}
        <section id="features" className={`${styles.section} ${styles.sectionTinted}`}>
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>Everything in one place</span>
            <h2 className={styles.sectionTitle}>Built for real, busy weeks.</h2>
          </div>
          <div className={styles.bento}>
            {FEATURES.map(({ icon: Icon, tone, title, body }) => (
              <article key={title} className={`${styles.featureCard} ${styles[`tone_${tone}`]}`}>
                <span className={styles.featureIcon}>
                  <Icon size={24} weight="bold" />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Board split ── */}
        <section className={styles.section}>
          <div className={styles.split}>
            <div className={styles.splitCopy}>
              <span className={styles.kicker}>Tasks that move</span>
              <h2 className={styles.sectionTitle}>A board for work, a timeline for time.</h2>
              <p className={styles.sectionLead}>
                Plan tasks on the Board, then give them a time and watch them land on your day. Priorities,
                labels, projects and recurring tasks are all built in.
              </p>
              <ul className={styles.ticks}>
                <li>
                  <Kanban size={20} weight="bold" /> To Do, In Progress and Done columns with WIP limits
                </li>
                <li>
                  <CalendarCheck size={20} weight="bold" /> Daily, weekly, monthly and yearly repeats
                </li>
                <li>
                  <Sparkle size={20} weight="bold" /> Keyboard shortcuts for quick capture
                </li>
              </ul>
            </div>
            <div className={`${styles.browser} ${styles.splitVisual}`}>
              <div className={styles.browserBar} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <Image
                src="/landing/board.webp"
                alt="Planorama task board"
                width={1600}
                height={1000}
                sizes="(max-width: 900px) 100vw, 640px"
                className={styles.browserImg}
              />
            </div>
          </div>
        </section>

        {/* ── Privacy ── */}
        <section id="privacy" className={`${styles.section} ${styles.sectionTight}`}>
          <div className={styles.privacy}>
            <span className={styles.privacyIcon}>
              <LockKey size={32} weight="bold" />
            </span>
            <div>
              <h2 className={styles.privacyTitle}>Your plans stay yours.</h2>
              <p>
                Start in Local Mode and everything stays in your browser. Connect Google only if you want to:
                sign-in uses Google’s own consent screen, and calendar tokens are encrypted at rest.
              </p>
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className={styles.finalCta}>
          <h2>
            Ready to see your year <span className={styles.highlight}>in color?</span>
          </h2>
          <p>Open Planorama and make your first plan in seconds.</p>
          <Link href="/app" className={styles.btnPrimary}>
            Open Planorama <ArrowRight size={18} weight="bold" />
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <span className={styles.brand}>
          <span className={styles.brandMark}>
            <CalendarBlank size={18} weight="fill" />
          </span>
          <span>
            planorama<span className={styles.brandDot}>.</span>
          </span>
        </span>
        <span>A little more organized, a lot more you.</span>
      </footer>
    </div>
  );
}
