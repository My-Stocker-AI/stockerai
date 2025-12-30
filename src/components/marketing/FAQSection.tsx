import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSectionProps {
  items: FAQItem[];
  headline?: string;
}

const FAQSection = ({ items, headline = "Frequently Asked Questions" }: FAQSectionProps) => {
  return (
    <div className="w-full">
      {headline && (
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-8 text-center">
          {headline}
        </h2>
      )}
      <Accordion type="single" collapsible className="w-full max-w-3xl mx-auto">
        {items.map((item, index) => (
          <AccordionItem key={index} value={`item-${index}`} className="border-border">
            <AccordionTrigger className="text-left text-lg font-medium text-foreground hover:text-primary">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default FAQSection;