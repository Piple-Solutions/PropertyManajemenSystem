import { about } from '@/content/publicContent';
import { ICONS, PageCta, PageHero, PlaceholderMedia, Reveal, usePageTitle, usePublicTone } from '@/components/public/kit';
import '../styles/public.css';

const TONES = ['light', 'warm', 'dark', 'light'] as const;

export default function AboutPage() {
  usePublicTone('dark');
  usePageTitle(about.title);
  const { story, concept, values, welcome } = about;

  return (
    <>
      <PageHero id="about-title" content={about.hero} />

      {/* Story */}
      <section className="pub-section pub-section--sand" aria-labelledby="about-story-title">
        <div className="pub-container pub-about">
          <Reveal immediate className="pub-about__copy">
            <p className="pub-eyebrow pub-eyebrow--dark">{story.eyebrow}</p>
            <h2 id="about-story-title" className="pub-h2">
              {story.title}
            </h2>
            {story.paragraphs.map((p) => (
              <p className="pub-body" key={p}>
                {p}
              </p>
            ))}
          </Reveal>
          <Reveal immediate delay={2} className="pub-about__visual pub-about__visual--page">
            <PlaceholderMedia variant="wide" label={story.mediaLabel} />
          </Reveal>
        </div>
      </section>

      {/* Joglo concept */}
      <section className="pub-section" aria-labelledby="about-concept-title">
        <div className="pub-container">
          <Reveal className="pub-sh">
            <p className="pub-eyebrow pub-eyebrow--dark">{concept.eyebrow}</p>
            <h2 id="about-concept-title" className="pub-h2">
              {concept.title}
            </h2>
            <p className="pub-body">{concept.subtitle}</p>
          </Reveal>
          <ol className="pub-concept">
            {concept.items.map((item, index) => (
              <Reveal as="li" delay={index} className="pub-concept__item" key={item.title}>
                <span className="pub-concept__no" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="pub-concept__title">{item.title}</h3>
                <p>{item.text}</p>
              </Reveal>
            ))}
          </ol>
          <p className="pub-note">{concept.note}</p>
        </div>
      </section>

      {/* Values */}
      <section className="pub-section pub-section--warm" aria-labelledby="about-values-title">
        <div className="pub-container">
          <Reveal className="pub-sh">
            <h2 id="about-values-title" className="pub-h2">
              {values.title}
            </h2>
          </Reveal>
          <ul className="pub-grid4">
            {values.items.map((item, index) => {
              const Icon = ICONS[item.icon];
              return (
                <Reveal as="li" delay={index % 4} className={`pub-tile pub-tile--${TONES[index % 4]}`} key={item.title}>
                  <span className="pub-icon-chip" aria-hidden="true">
                    <Icon size={22} />
                  </span>
                  <h3 className="pub-tile__title">{item.title}</h3>
                  <p>{item.text}</p>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </section>

      {/* How guests are welcomed */}
      <section className="pub-section" aria-labelledby="about-welcome-title">
        <div className="pub-container">
          <Reveal className="pub-sh">
            <h2 id="about-welcome-title" className="pub-h2">
              {welcome.title}
            </h2>
          </Reveal>
          <ol className="pub-steps">
            {welcome.steps.map((step, index) => (
              <Reveal as="li" delay={index} className="pub-step" key={step.title}>
                <h3 className="pub-step__title">{step.title}</h3>
                <p>{step.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <PageCta id="about-cta-title" content={about.cta} />
    </>
  );
}
