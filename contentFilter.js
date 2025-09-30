export class ContentFilter {
  constructor() {
    // Sensitive topics to block
    this.blockedKeywords = [
      // Religion
      'god', 'jesus', 'allah', 'buddha', 'christianity', 'islam', 'hinduism', 'judaism',
      'religion', 'religious', 'church', 'mosque', 'temple', 'bible', 'quran', 'prayer',
      'atheist', 'atheism', 'faith', 'belief in god',

      // Sexual content
      'sex', 'sexual', 'porn', 'pornography', 'masturbat', 'penis', 'vagina', 'breast',
      'nude', 'naked', 'intercourse', 'orgasm', 'arousal', 'erotic', 'sexy',
      'inappropriate touch', 'sexual orient', 'transgender', 'lgbtq', 'gay', 'lesbian',

      // Violence
      'kill', 'murder', 'death', 'die', 'shoot', 'gun', 'weapon', 'bomb', 'terrorist',
      'violence', 'violent', 'assault', 'attack', 'hurt', 'harm', 'torture', 'abuse',
      'rape', 'molest', 'stab', 'blood', 'gore', 'war crimes', 'genocide',

      // Hate speech
      'racist', 'racism', 'nazi', 'hate', 'supremacist', 'slur', 'offensive',

      // Drugs
      'cocaine', 'heroin', 'meth', 'drug abuse', 'narcotic', 'overdose',

      // Political extremism
      'extremist', 'radical', 'militant', 'insurgent',

      // Illegal activities
      'illegal', 'crime', 'criminal', 'steal', 'theft', 'fraud', 'scam'
    ];

    // Patterns to catch variations
    this.blockedPatterns = [
      /k[i1!]ll/i,
      /d[i1!]e/i,
      /s[e3]x/i,
      /r[e3]l[i1!]g[i1!][o0]n/i,
      /v[i1!][o0]l[e3]n[ct]/i
    ];
  }

  checkTopic(topic) {
    const lowerTopic = topic.toLowerCase();

    // Check for blocked keywords
    for (const keyword of this.blockedKeywords) {
      if (lowerTopic.includes(keyword)) {
        return {
          allowed: false,
          reason: `Topic contains sensitive content (${keyword})`,
          timestamp: Date.now()
        };
      }
    }

    // Check for blocked patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(topic)) {
        return {
          allowed: false,
          reason: 'Topic contains sensitive content',
          timestamp: Date.now()
        };
      }
    }

    // Check topic length
    if (topic.length < 5) {
      return {
        allowed: false,
        reason: 'Topic too short (minimum 5 characters)',
        timestamp: Date.now()
      };
    }

    if (topic.length > 200) {
      return {
        allowed: false,
        reason: 'Topic too long (maximum 200 characters)',
        timestamp: Date.now()
      };
    }

    // Check if it's actually a question/topic
    if (!/[a-zA-Z]/.test(topic)) {
      return {
        allowed: false,
        reason: 'Topic must contain letters',
        timestamp: Date.now()
      };
    }

    // Grammar checks
    const grammarIssues = this.checkGrammar(topic);
    if (grammarIssues.length > 0) {
      return {
        allowed: false,
        reason: `Grammar issue: ${grammarIssues[0]}`,
        timestamp: Date.now()
      };
    }

    return {
      allowed: true,
      timestamp: Date.now()
    };
  }

  checkGrammar(topic) {
    const issues = [];

    // Check for multiple spaces
    if (/\s{2,}/.test(topic)) {
      issues.push('Contains multiple spaces in a row');
    }

    return issues;
  }
}