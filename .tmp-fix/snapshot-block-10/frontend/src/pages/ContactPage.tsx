import { ArrowUpRight, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { buildWhatsAppUrl, contactPage, site } from '@/content/publicContent';
import { Accordion, OrnamentDivider, PageHero, PlaceholderMedia, Reveal, usePageTitle, usePublicTone } from '@/components/public/kit';
import '../styles/public.css';

export default function ContactPage() {
  usePublicTone('dark');
  usePageTitle(contactPage.title);
  const { details, quick, map, faq } = contactPage;
  const rows = [
    { Icon: Phone, label: details.labels.phone, value: site.phone },
    { Icon: Mail, label: details.labels.email, value: site.email },
    { Icon: MapPin, label: details.labels.address, value: site.address },
    { Icon: Clock, label: details.labels.hours, value: site.hours },
  ];

  return (
    <>
      <PageHero id="contact-title" content={contactPage.hero}>
        <a
          className="pub-btn pub-btn--primary"
          href={buildWhatsAppUrl(contactPage.primaryMessage)}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={20} aria-hidden="true" />
          {contactPage.primaryCta}
        </a>
      </PageHero>

      {/* Details + map */}
      <section className="pub-section" aria-labelledby="contact-info-title">
        <div className="pub-container pub-contact">
          <Reveal immediate className="pub-contact__info">
            <h2 id="contact-info-title" className="pub-h2">
              {details.title}
            </h2>
            <p className="pub-body pub-muted">{details.note}</p>
            <dl className="pub-dl">
              {rows.map(({ Icon, label, value }) => (
                <div className="pub-dl__row" key={label}>
                  <dt>
                    <Icon size={18} aria-hidden="true" />
                    {label}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <Reveal immediate delay={2} className="pub-contact__map">
            <h2 className="pub-h3">{map.title}</h2>
            <div className="pub-map">
              <PlaceholderMedia variant="wide" label={map.label} />
              <span className="pub-map__pin" aria-hidden="true">
                <MapPin size={26} />
              </span>
            </div>
            <p className="pub-body pub-muted">{map.note}</p>
          </Reveal>
        </div>
      </section>

      {/* Quick WhatsApp topics */}
      <section className="pub-section pub-section--warm" aria-labelledby="contact-quick-title">
        <div className="pub-container">
          <Reveal className="pub-sh">
            <h2 id="contact-quick-title" className="pub-h2">
              {quick.title}
            </h2>
            <p className="pub-body">{quick.subtitle}</p>
          </Reveal>
          <ul className="pub-quick">
            {quick.items.map((item, index) => (
              <Reveal as="li" delay={index} key={item.label}>
                <a className="pub-quick__link" href={buildWhatsAppUrl(item.message)} target="_blank" rel="noreferrer">
                  <span>{item.label}</span>
                  <ArrowUpRight size={20} aria-hidden="true" />
                </a>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* Before contacting */}
      <section className="pub-section" aria-labelledby="contact-faq-title">
        <div className="pub-container pub-faq">
          <Reveal className="pub-faq__head">
            <h2 id="contact-faq-title" className="pub-h2">
              {faq.title}
            </h2>
            <OrnamentDivider />
          </Reveal>
          <Reveal delay={1}>
            <Accordion items={faq.items} />
          </Reveal>
        </div>
      </section>
    </>
  );
}
