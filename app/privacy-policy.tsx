import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '../lib/theme';

const CREAM      = Brand.cream;
const DEEP_GREEN = Brand.deepGreen;
const GREEN = Brand.green;
const TEXT_DARK  = Brand.textDark;
const TEXT_MUTED = Brand.textMuted;
const HAIRLINE   = Brand.hairline;

export const PP_SECTIONS = [
  {
    title: '1. Introduction',
    body: 'Rihdal ("we," "our," or "us") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, store, and safeguard your data when you use the Rihdal mobile application ("App").\n\nBy creating an account or using the App, you agree to the collection and use of your information as described in this Privacy Policy.',
  },
  {
    title: '2. Information We Collect',
    body: 'Information you provide directly:\n• Full name\n• Email address\n• Username\n• Profile photo (optional)\n• Restaurant submissions, reviews, ratings, and photos you upload\n• Halal certification documents you submit as part of a restaurant claim\n• Content reports you submit — including the content type, reason (spam, inappropriate, harassment, or other), and any optional comment you provide\n• User block relationships — a record of the user IDs you have chosen to block\n• Your acceptance of these Terms of Service and Privacy Policy, including the timestamp of acceptance\n• Contribution activity — a log of approved restaurant submissions, approved reviews, and approved photos used to calculate points and award badges\n• Your leaderboard display preference — whether you have chosen to appear under your real name or a generated pseudonym on the public Community leaderboard\n\nInformation collected automatically:\n• Location data — used to show nearby restaurants, calculate your local prayer times, and determine the Qibla direction from your position. Location is not stored on our servers.\n• Compass/heading data — used only to point the Qibla compass in the correct direction; not stored anywhere\n• Prayer settings — your location mode, saved city, calculation method, madhab (juristic school), and reminder preferences are stored only on your device and are never transmitted to or stored on our servers\n• Quran reading progress — your bookmarks and last-read position within each surah are stored only on your device and are never transmitted to our servers\n• Scan history — the last 10 barcodes you scan and their halal-status results are stored only on your device so you can quickly revisit recent lookups. This data is never transmitted to our servers\n• Camera and photo library access — used only for barcode scanning and photo uploads\n• Device push notification token — used only to deliver notifications that require our servers (e.g. review approvals, account alerts, event reminders). Prayer time reminders do not use this token — see Section 7.\n• Event reminder preferences — if you set a reminder for an upcoming mosque event, we store the event ID, your user ID, and your chosen lead time (e.g. 1 hour or 1 day before) in our database. This data is deleted when you remove the reminder or delete your account.\n\nNote on barcode scan reports: if you submit a "Report this result" on the scanner, the report is stored anonymously — no account identifier or user ID is attached to it. This is intentional to allow anyone, including guest users, to flag incorrect results.',
  },
  {
    title: '3. How We Use Your Information',
    body: 'We use the information we collect to:\n• Create and manage your account\n• Deliver the core features of the App (restaurant discovery, reviews, barcode scanning, prayer times, and Qibla direction)\n• Calculate your prayer times and Qibla direction based on your location\n• Schedule prayer time reminders locally on your device\n• Process and display your submitted restaurants and reviews\n• Send account-related notifications (e.g. email verification, password reset)\n• Send push notifications related to your activity in the App\n• Respond to support requests and copyright complaints\n• Protect the integrity of our services through admin moderation\n• Review and action content reports submitted by users to maintain community safety\n• Maintain user block relationships to personalise your content experience and protect you from unwanted interactions\n• Record your acceptance of our Terms of Service and Privacy Policy for legal compliance\n• Track approved contributions (restaurant submissions, reviews, and photos) to award points and badges and display your rank on the Community leaderboard\n• Display your name and avatar on the public Community leaderboard — if you enable the anonymity option, a generated pseudonym is shown instead of your real name\n• Send event reminder push notifications when a mosque event you set a reminder for is approaching\n• Comply with legal obligations\n• Improve the App based on usage and feedback',
  },
  {
    title: '4. Legal Basis for Processing (California & US Users)',
    body: 'We process your personal information on the following legal bases:\n\n• Contract — processing is necessary to provide the App and its features to you under our Terms of Service\n• Legitimate Interest — to moderate community content, prevent abuse, and improve the App\n• Legal Obligation — to comply with applicable US laws including COPPA and CCPA\n• Consent — for optional features such as push notifications and profile photos, which you may withdraw at any time',
  },
  {
    title: '5. Data We Do Not Collect',
    body: 'We do not collect:\n• Payment or financial information\n• Phone numbers or mailing addresses\n• Social security numbers or government IDs\n• Health or medical information\n• Device advertising IDs\n• Browsing history or data from other apps',
  },
  {
    title: '6. Third-Party Services',
    body: 'We use the following third-party services to operate the App. Each has its own privacy policy and terms:\n\n• Supabase — authentication, database storage, and file storage. Your data is stored on Supabase\'s servers with industry-standard encryption.\n\n• Open Food Facts — barcode and ingredient lookups. Queries include only the scanned barcode number and are made anonymously without sharing your personal information.\n\n• Nominatim / OpenStreetMap — used for address autocomplete when submitting a restaurant. Queries are made anonymously.\n\n• OpenStreetMap Overpass API — used to find mosques near your location. Queries include your approximate coordinates and are made anonymously. No account information or personal identifiers are sent.\n\n• UmmahAPI — used to provide Quran text and Duas content. Requests are made anonymously without sharing any personal information.\n\n• Expo — app framework and push notification delivery via the Expo push notification service. Your device push token is shared with Expo solely for the purpose of delivering notifications you have opted into.\n\nWe do not sell, trade, rent, or share your personal information with any third party for advertising or marketing purposes.',
  },
  {
    title: '7. Prayer Times, Qibla & Notifications',
    body: 'Prayer time and Qibla calculations happen entirely on your device using your location and standard, open-source astronomical formulas. We do not send your location or prayer settings to any server to perform this calculation.\n\nPrayer reminder notifications are scheduled locally on your device by the operating system. No network request, server call, or push token is involved in delivering these reminders — they work independently of our servers, and continue to function without an internet connection, provided your device and notification permissions allow it.\n\nSeparately, if you grant permission, Rihdal may send push notifications — which do require a device push token registered with our servers and delivered via Expo\'s push notification service — regarding:\n• The status of your restaurant submissions or reviews\n• Account-related alerts\n• App updates or important announcements\n• Upcoming mosque events you have set a reminder for (event reminders are processed server-side and delivered via Expo\'s push notification service, unlike prayer reminders which are entirely local)\n\nYour device push token is stored securely in our database and shared only with Expo\'s push notification service for delivery. You can disable either type of notification at any time in your device settings.',
  },
  {
    title: '8. User-Uploaded Photos',
    body: 'Photos you upload to the App are stored in our Supabase cloud storage and may be visible to other users within the App. By uploading a photo you confirm you are the original photographer or have the right to use it.\n\nDo not upload photos containing personally identifiable information of others without their consent. We reserve the right to remove any photo at any time.',
  },
  {
    title: '9. Data Retention',
    body: 'We retain your personal information for as long as your account is active. If you delete your account, your personal data is removed immediately, including:\n• Your profile, reviews, submissions, and uploaded photos\n• All block relationships you created (users you blocked)\n• All content reports you submitted\n• Your Terms of Service acceptance record\n• Your contribution points log, badges, and leaderboard display preference\n\nExceptions where data may be retained:\n• Where retention is required by applicable law\n• Where content has been incorporated into shared community data in a way that cannot be individually removed (e.g. anonymised aggregated data)\n• Content reports may be retained in anonymised form where necessary to complete an ongoing moderation review\n\nNote on push tokens: your device push notification token is stored for as long as your account exists. If you sign out without deleting your account, your token remains stored so that account-related notifications can still be delivered if you sign back in. To remove your token from our servers, delete your account from the Profile section of the App.',
  },
  {
    title: '10. Account Deletion',
    body: 'You can permanently delete your account at any time directly from the Profile section of the App — no need to contact support.\n\nUpon deletion, your name, email, profile photo, reviews, uploaded photos, and push notification token are immediately and permanently removed from our systems.\n\nNote: If deletion fails due to a technical issue, you may contact us at support@rihdal.com and we will manually delete your account within 7 business days.',
  },
  {
    title: '11. Security',
    body: 'Your data is protected by:\n• Supabase Auth with encrypted password storage\n• Row Level Security (RLS) policies ensuring users can only access their own data\n• All data transmitted over HTTPS/TLS encryption\n• No admin-level API keys shipped in the app binary\n\nWhile we implement industry-standard security measures, no method of electronic transmission or storage is 100% secure. We cannot guarantee absolute security.',
  },
  {
    title: '12. Children\'s Privacy (COPPA)',
    body: 'Rihdal is not directed at children under 13 years of age. We do not knowingly collect personal information from children under 13.\n\nIf we become aware that we have collected personal information from a child under 13 without parental consent, we will take immediate steps to delete that information and terminate the associated account.\n\nIf you believe a child under 13 has created an account or provided us with personal information, please contact us immediately at support@rihdal.com.',
  },
  {
    title: '13. California Privacy Rights (CCPA)',
    body: 'If you are a California resident, the California Consumer Privacy Act (CCPA) grants you the following rights:\n\n• Right to Know — You may request a copy of the personal information we have collected about you in the past 12 months, including the categories and specific pieces of data.\n\n• Right to Delete — You may request deletion of your personal information, subject to certain legal exceptions.\n\n• Right to Opt-Out of Sale — Rihdal does not sell your personal information. There is nothing to opt out of.\n\n• Right to Non-Discrimination — We will not deny you services, charge you different prices, or provide a different quality of service because you exercised your CCPA rights.\n\nTo exercise any of these rights, email us at support@rihdal.com with the subject line "CCPA Request." We will respond within 45 days.',
  },
  {
    title: '14. Your Rights',
    body: 'Regardless of your location, you have the right to:\n• Access the personal data we hold about you\n• Request correction of inaccurate or incomplete data\n• Request deletion of your personal data\n• Withdraw consent for optional data processing (e.g. push notifications) at any time\n• Lodge a complaint with a relevant data protection authority\n\nTo exercise any of these rights, contact us at support@rihdal.com.',
  },
  {
    title: '15. Changes to This Policy',
    body: 'We may update this Privacy Policy from time to time. When we do, we will revise the "Last Updated" date at the top of this page.\n\nFor significant changes, we will notify you via an in-app notification or email. Continued use of the App after changes constitutes acceptance of the updated Privacy Policy.\n\nIf you do not agree to the updated Privacy Policy, you must stop using the App and delete your account.',
  },
  {
    title: '16. Contact Us',
    body: 'If you have any questions, concerns, or requests regarding this Privacy Policy, please contact us at:\n\nEmail: support@rihdal.com\n\nWe aim to respond to all privacy-related enquiries within 7 business days.',
  },
];

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.flex}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={TEXT_DARK} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        <View style={s.introCard}>
          <Ionicons name="shield-checkmark" size={32} color={GREEN} style={{ marginBottom: 10 }} />
          <Text style={s.introTitle}>Your Privacy Matters</Text>
          <Text style={s.introText}>Last updated: July 21, 2026</Text>
          <Text style={[s.introText, { marginTop: 8 }]}>
            We built Rihdal to serve the Muslim community. We take your privacy seriously and will never sell or misuse your data.
          </Text>
        </View>

        {PP_SECTIONS.map((section, i) => (
          <View key={i} style={s.section}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <Text style={s.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={s.contactCard}>
          <Ionicons name="mail-outline" size={20} color={GREEN} />
          <Text style={s.contactText}>
            Questions? Email us at{' '}
            <Text style={s.contactEmail}>support@rihdal.com</Text>
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CREAM },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: CREAM, borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: TEXT_DARK },

  content: { padding: 16, paddingBottom: 40 },

  introCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    alignItems: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  introTitle: { fontSize: 18, fontWeight: '700', color: TEXT_DARK, marginBottom: 4 },
  introText: { fontSize: 13, color: TEXT_MUTED, lineHeight: 20, textAlign: 'center' },

  section: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: TEXT_DARK, marginBottom: 8 },
  sectionBody: { fontSize: 13, color: TEXT_MUTED, lineHeight: 21 },

  contactCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f0faf6', borderRadius: 12, padding: 14, marginTop: 6,
    borderWidth: 1, borderColor: '#c6e8d6',
  },
  contactText: { flex: 1, fontSize: 13, color: TEXT_MUTED, lineHeight: 20 },
  contactEmail: { color: GREEN, fontWeight: '600' },
});
