export class TopicGenerator {
  constructor() {
    this.topics = [
      // Technology
      "Should artificial intelligence be regulated by governments?",
      "Are electric vehicles better for the environment than hybrid cars?",
      "Should social media platforms be held responsible for user content?",
      "Is remote work more productive than office work?",
      "Should cryptocurrencies replace traditional banking?",
      "Are smartphones making us less social?",
      "Should there be a universal basic income due to automation?",
      "Is online education as effective as in-person learning?",
      "Should self-driving cars be allowed on public roads?",
      "Are video games beneficial for cognitive development?",

      // Environment
      "Should plastic bags be completely banned?",
      "Is nuclear energy a good solution for climate change?",
      "Should governments mandate recycling programs?",
      "Are paper books better than e-books for the environment?",
      "Should companies be taxed based on carbon emissions?",
      "Is vegetarianism better for the environment?",
      "Should national parks allow commercial development?",
      "Are renewable energy sources cost-effective?",

      // Society
      "Should school start times be later for teenagers?",
      "Is homework beneficial for students?",
      "Should voting be mandatory?",
      "Are participation trophies good for children?",
      "Should junk food be taxed?",
      "Is social media good for democracy?",
      "Should college education be free?",
      "Are books better than movies for storytelling?",
      "Should school uniforms be mandatory?",
      "Is handwriting still important in the digital age?",

      // Economics
      "Should the minimum wage be raised?",
      "Are free markets better than regulated markets?",
      "Should wealthy individuals pay higher taxes?",
      "Is capitalism better than socialism?",
      "Should inheritance be taxed?",
      "Are labor unions beneficial for workers?",
      "Should companies be required to share profits with employees?",

      // Health
      "Should sugary drinks be taxed?",
      "Is organic food worth the extra cost?",
      "Should healthcare be universal?",
      "Are gym memberships worth the money?",
      "Should fast food restaurants display calorie counts?",
      "Is intermittent fasting effective for weight loss?",
      "Should vaccines be mandatory?",
      "Are standing desks better than sitting desks?",

      // Entertainment
      "Are movie remakes better than original films?",
      "Should esports be considered real sports?",
      "Is streaming better than traditional television?",
      "Are modern music artists as talented as classic artists?",
      "Should museums charge admission fees?",
      "Is reality TV harmful to society?",
      "Are comic book movies oversaturating the film industry?",

      // Philosophy & Ethics
      "Is privacy more important than security?",
      "Should zoos exist?",
      "Is it ethical to use animals for scientific research?",
      "Should extinct species be brought back through cloning?",
      "Is space exploration worth the cost?",
      "Should we colonize Mars?",
      "Is happiness more important than success?",
      "Should humans try to achieve immortality?",

      // Daily Life
      "Is breakfast the most important meal of the day?",
      "Are cats better pets than dogs?",
      "Should people make their beds every morning?",
      "Is coffee better than tea?",
      "Should you dress for the job you want?",
      "Are mornings better than evenings for productivity?",
      "Should children have regular chores?",
      "Is it better to rent or buy a home?"
    ];

    this.usedTopics = [];
  }

  generateTopic() {
    // Reset if all topics have been used
    if (this.usedTopics.length >= this.topics.length) {
      this.usedTopics = [];
    }

    // Get unused topics
    const availableTopics = this.topics.filter(topic => !this.usedTopics.includes(topic));

    // Select random topic
    const randomTopic = availableTopics[Math.floor(Math.random() * availableTopics.length)];

    // Mark as used
    this.usedTopics.push(randomTopic);

    return randomTopic;
  }
}