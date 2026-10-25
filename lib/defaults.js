// Initial content. Only confirmed facts + clearly marked placeholders. Stored in the DB on first edit;
// until then these values are served. Everything here is editable from /admin.
const settings = {
  tournamentName: 'DEV HOMES FOOTBALL TOURNAMENT 2026',
  prizePool: 'XXXX',                 // placeholder until the organizer decides
  contactNumber: 'XXXXXXXXXX',       // placeholder until the organizer provides the real number
  matchDate: '2026-11-01',
  venue: 'Dev Homes',
  locality: 'Bindukhera, Rudrapur',
  region: 'Uttarakhand, India',
  entryFee: 3000,
  ageMin: 13,
  ageMax: 17,
  playersPerSide: 9,
  mapUrl: '',                        // optional https link; the button only appears when set
};

const faqs = [
  ['When will the tournament take place?', 'The tournament is scheduled for {{date}}.'],
  ['Where will the matches take place?', 'The matches will be played at {{location}}.'],
  ['What is the match format?', 'The tournament will follow a {{format}} football format.'],
  ['What is the team entry fee?', 'The entry fee is {{fee}} per team.'],
  ['What is the eligible age group?', 'Players aged {{ageGroup}} are eligible. Any additional verification or eligibility rules must be confirmed by the organizer.'],
  ['How do I register my team?', 'Contact the tournament organizer on {{contact}}.'],
  ['What is the prize pool?', 'Prize pool: {{prizePool}}.'],
  ['What are the match timings and tournament rules?', 'The organizer will announce the detailed schedule and rules.'],
].map(([question, answer], i) => ({ id: 'f' + (i + 1), question, answer }));

const announcements = [];

// Participating teams – managed from /admin. Starts empty (no teams are invented).
const teams = [];

module.exports = { settings, faqs, announcements, teams };
