import { MigrationInterface, QueryRunner } from 'typeorm';

const CATEGORIES: Record<string, string[]> = {
  Technology: [
    'AI systems should be open-sourced rather than kept proprietary',
    'Microservices are a better default architecture than monoliths',
    'Strong static typing produces more maintainable software than dynamic typing',
    'The benefits of social media outweigh its harms',
    'Software engineers should be professionally licensed like doctors and lawyers',
    'End-to-end encryption should never include government backdoors',
    'Cryptocurrencies will eventually replace traditional banking',
    'Tech companies should be legally liable for their algorithmic recommendations',
    'Fully autonomous vehicles will make roads safer than human drivers',
    'Open plan offices harm software developer productivity',
  ],
  Philosophy: [
    'Free will is an illusion',
    'The ends can justify the means',
    'Artificial general intelligence would deserve moral consideration',
    'Objective moral truths exist independently of human opinion',
    'A perfectly simulated universe is equivalent to a real one',
    'Personal identity persists through complete memory loss',
    'Suffering is necessary for a meaningful life',
    'Knowledge requires certainty',
    'Humans are fundamentally selfish',
    'Death is what gives life its meaning',
  ],
  Economics: [
    'Universal basic income is a net positive for society',
    'Remote work makes companies more productive',
    'Central banks should issue digital currencies',
    'A four-day work week benefits both employers and employees',
    'Rent control does more harm than good',
    'Globalization has benefited developing nations more than it has harmed them',
    'Automation will create more jobs than it destroys',
    'Wealth taxes are an effective tool for reducing inequality',
    'Minimum wage increases reduce overall employment',
    'Economic growth should take priority over income equality',
  ],
  Science: [
    'Human genetic engineering should be permitted for disease prevention',
    'Crewed space exploration is worth its enormous cost',
    'Nuclear energy is essential for a sustainable future',
    'Animal testing is justified when it advances human medicine',
    'The scientific method is the only reliable path to knowledge',
    'De-extinction of species like the woolly mammoth should be pursued',
    'Scientific research should be publicly funded rather than privately driven',
    'Geoengineering is an acceptable response to climate change',
    'The search for extraterrestrial intelligence deserves serious funding',
    'Peer review remains the best system for validating research',
  ],
  Politics: [
    'Voting should be mandatory for all eligible citizens',
    'Term limits should apply to all elected offices',
    'Direct democracy is superior to representative democracy',
    'Social media platforms should be regulated as public utilities',
    'Open borders would benefit both sending and receiving countries',
    'Lowering the voting age to 16 would strengthen democracy',
    'Political advertising should be banned on social media',
    'Compulsory national service benefits society',
    'Lobbying does more harm than good to democratic institutions',
    'International organizations should hold power over national governments',
  ],
  Education: [
    'Standardized testing does more harm than good',
    'University education should be free for all students',
    'Homework should be abolished in primary schools',
    'Coding should be a mandatory subject like math or science',
    'Grades should be replaced with narrative feedback',
    'Online learning can fully replace traditional classrooms',
    'Teachers should be paid based on student performance',
    'Liberal arts degrees are as valuable as STEM degrees',
    'School uniforms benefit student learning environments',
    'AI tutors will eventually outperform human teachers',
  ],
  Health: [
    'Healthcare should be a universal public service rather than a market good',
    'Sugar should be taxed like tobacco and alcohol',
    'Vaccinations should be mandatory for school attendance',
    'Mental health care deserves equal funding to physical health care',
    'Pharmaceutical companies should lose patent rights during health crises',
    'Physician-assisted dying should be legal for terminally ill patients',
    'Alternative medicine should be excluded from public health funding',
    'Genetic screening of embryos should be a parental right',
    'Advertising processed food to children should be banned',
    'Longevity research should be a top public health priority',
  ],
  Environment: [
    'Nuclear power is the most practical path to decarbonization',
    'Corporate accountability matters more than individual action for climate change',
    'Economic degrowth is necessary to prevent ecological collapse',
    'Carbon taxes are more effective than cap-and-trade systems',
    'Lab-grown meat should replace conventional animal farming',
    'National parks should ban all commercial activity',
    'Climate refugees deserve special international legal status',
    'Banning single-use plastics does more good than harm',
    'Wealthy nations owe climate reparations to developing countries',
    'Rewilding is a better strategy than managed conservation',
  ],
  Ethics: [
    'It is ethical to eat meat',
    'Lying is sometimes the morally right thing to do',
    'Wealthy individuals have a moral duty to donate most of their wealth',
    'Capital punishment can never be morally justified',
    'Parents should be allowed to genetically select traits for their children',
    'Whistleblowing justifies breaking confidentiality agreements',
    'Zoos are unethical regardless of their conservation benefits',
    'Moral responsibility requires free will',
    'Future generations deserve equal moral consideration to people alive today',
    'It is wrong to create sentient AI capable of suffering',
  ],
  Culture: [
    'Art created by AI deserves the same recognition as human-made art',
    'Museums should return artifacts to their countries of origin',
    'Video games are a legitimate art form equal to film and literature',
    'Social media has degraded the quality of public discourse',
    'Remakes and sequels are harming creative originality in cinema',
    'Literary classics should be updated to reflect modern values',
    'Celebrity culture does more harm than good to society',
    'Streaming has improved the overall quality of television',
    'Graffiti should be recognized as legitimate public art',
    'Machine translation will make learning foreign languages unnecessary',
  ],
};

export class SeedCategoriesTopics1783036800001 implements MigrationInterface {
  name = 'SeedCategoriesTopics1783036800001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [categoryName, topics] of Object.entries(CATEGORIES)) {
      await queryRunner.query(
        `INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [categoryName],
      );
      for (const topic of topics) {
        await queryRunner.query(
          `INSERT INTO topics (category_id, topic)
           SELECT c.id, $2::varchar
           FROM categories c
           WHERE c.name = $1
             AND NOT EXISTS (
               SELECT 1 FROM topics t WHERE t.category_id = c.id AND t.topic = $2
             )`,
          [categoryName, topic],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [categoryName, topics] of Object.entries(CATEGORIES)) {
      await queryRunner.query(
        `DELETE FROM topics t
         USING categories c
         WHERE t.category_id = c.id AND c.name = $1 AND t.topic = ANY($2)`,
        [categoryName, topics],
      );
      await queryRunner.query(
        `DELETE FROM categories c
         WHERE c.name = $1 AND NOT EXISTS (SELECT 1 FROM topics t WHERE t.category_id = c.id)`,
        [categoryName],
      );
    }
  }
}
