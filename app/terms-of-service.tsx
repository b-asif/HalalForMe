import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const GREEN = '#245737';

export const TOS_SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: 'By downloading, installing, or using HalalForMe (the "App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the App.\n\nThese Terms constitute a legally binding agreement between you and HalalForMe. Your continued use of the App following any updates to these Terms constitutes acceptance of those changes.',
  },
  {
    title: '2. Description of Service',
    body: 'HalalForMe is a community-driven mobile application designed to help Muslim consumers:\n• Discover halal-certified and halal-friendly restaurants\n• Verify halal ingredient compliance in packaged food products via barcode scanning\n• Submit and review restaurant listings for the benefit of the community\n• Earn points, unlock badges, and appear on the Community leaderboard by contributing approved content\n\nRestaurant listings are submitted by users and are subject to review by our admin team. HalalForMe does not independently verify or certify the halal status of any establishment or product.',
  },
  {
    title: '3. Eligibility & Age Requirement',
    body: 'You must be at least 13 years old to create an account or use HalalForMe. By using the App, you represent and warrant that you are 13 years of age or older.\n\nIf you are under 18, you represent that your parent or legal guardian has reviewed and agreed to these Terms on your behalf.\n\nIn compliance with the Children\'s Online Privacy Protection Act (COPPA), we do not knowingly collect personal information from children under 13. If we become aware that a user is under 13, we will immediately delete their account and associated data. If you believe a child under 13 has registered, please contact us at infor.halalforme@gmail.com.',
  },
  {
    title: '4. User Accounts',
    body: 'You must create an account to submit restaurants, write reviews, or save favourites. By creating an account you agree to:\n• Provide accurate, complete, and current information at registration\n• Maintain the confidentiality of your password and login credentials\n• Accept responsibility for all activity that occurs under your account\n• Notify us immediately of any unauthorised use of your account at infor.halalforme@gmail.com\n\nYou may not create an account on behalf of another person or use a false identity. One account per person is permitted.',
  },
  {
    title: '5. User-Submitted Content',
    body: 'Users may submit restaurant listings, reviews, ratings, halal certification claims, and other content ("User Content"). By submitting User Content you:\n• Confirm that it is accurate and truthful to the best of your knowledge\n• Grant HalalForMe a non-exclusive, royalty-free, worldwide licence to display, distribute, and moderate it within the App\n• Acknowledge that it may be reviewed, edited, or removed by our admin team at any time without notice\n• Accept sole responsibility for the accuracy and legality of what you submit\n\nCOMMUNITY POINTS & BADGES\nApproved restaurant submissions earn 50 points, approved reviews earn 15 points, and approved photo uploads earn 10 points. Points and badges are awarded automatically when our admin team approves your content. HalalForMe reserves the right to adjust, withhold, or revoke points and badges at any time, including where content is later found to be inaccurate, misleading, or in violation of these Terms. Points and badges have no monetary value and cannot be transferred, redeemed, or exchanged.\n\nHalalForMe does not endorse any User Content and expressly disclaims all liability arising from User Content submitted by others.\n\nCONTENT REPORTING\nIf you encounter User Content that you believe violates these Terms or is harmful to the community, you may report it using the flag button available on each review. When you submit a report you must select a reason (spam, inappropriate, harassment, or other) and may optionally provide additional details. Reports are reviewed by our admin team, who may remove the content and take action against the submitting user. Submitting a false, malicious, or bad-faith report is a violation of these Terms and may result in account suspension.\n\nUSER BLOCKING\nYou may block other users to prevent their content from appearing in your experience. Blocked users are not notified that they have been blocked. Blocking is a personal visibility control — it does not remove a user\'s content for other users and does not constitute a formal report. You can manage and remove your blocks at any time from the Blocked Users section in your profile settings.',
  },
  {
    title: '6. Photo Uploads & Copyright Policy',
    body: 'When uploading photos to HalalForMe, the following rules apply without exception:\n\nOWNERSHIP REQUIREMENT\nYou may only upload photos that you personally took or created. Uploading images downloaded from the internet, taken from Google, social media, restaurant websites, stock photo services, or any other third-party source is strictly prohibited, regardless of whether those images appear to be freely available.\n\nWHAT THIS MEANS\nBy uploading a photo you confirm:\n• You are the original photographer or creator of the image\n• You own all rights to the image or have been explicitly granted permission to use it by the rights holder\n• The upload does not infringe any third-party copyright, trademark, or intellectual property right\n\nHALALFORME\'S LIABILITY\nHalalForMe is not responsible for any copyright infringement resulting from photos uploaded by users. If you upload an image you do not own, you — not HalalForMe — bear full legal and financial responsibility for any resulting copyright claims, takedown demands, or legal proceedings.\n\nWe reserve the right to remove any photo at any time without notice if we receive a complaint or have reason to believe it may infringe a third party\'s rights.',
  },
  {
    title: '7. Copyright Complaints & Takedown Requests',
    body: 'If you believe that content on HalalForMe infringes your copyright or intellectual property rights, please notify us promptly at:\n\nEmail: infor.halalforme@gmail.com\nSubject line: "Copyright Complaint"\n\nYour notice must include:\n• Your name and contact information\n• A description of the copyrighted work you claim has been infringed\n• The specific content in the App you believe is infringing (include screenshots if possible)\n• A statement that you have a good-faith belief that the use is not authorised by the copyright owner\n• A statement, under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorised to act on their behalf\n\nWe will review all valid complaints and aim to respond within 7 business days. We reserve the right to remove content and/or suspend the accounts of repeat infringers.',
  },
  {
    title: '8. Halal Accuracy Disclaimer',
    body: 'HalalForMe makes no guarantee, representation, or warranty regarding the halal status of any restaurant, product, or ingredient listed in the App.\n\nAll certification statuses, halal claims, and ingredient analyses are provided for informational purposes only. They are based on community submissions and publicly available data and have not been independently verified by HalalForMe.\n\nYou should always:\n• Verify halal status directly with the restaurant or certifying authority\n• Check the physical product label before consumption\n• Consult a qualified Islamic scholar if you have specific religious dietary concerns\n\nHalalForMe expressly disclaims all liability for any harm, illness, religious concern, or other loss arising from reliance on information within the App.',
  },
  {
    title: '9. Barcode Scanner & Ingredient Data',
    body: 'The barcode scanner feature uses ingredient data sourced from Open Food Facts (openfoodfacts.org), a free and open-source food product database. This data is provided by the Open Food Facts community and is not curated or verified by HalalForMe.\n\nImportant limitations:\n• Ingredient formulations can change without notice\n• Data may vary by country, manufacturer, or production batch\n• A product marked as halal or haram in the App may not reflect its current real-world status\n\nAlways verify by reading the physical product label. HalalForMe is not responsible for any errors, omissions, or outdated information in third-party ingredient data.',
  },
  {
    title: '10. Third-Party Services',
    body: 'HalalForMe integrates the following third-party services. Your use of the App is also subject to their respective terms:\n\n• Supabase — database, authentication, and file storage\n• Open Food Facts — barcode and ingredient data\n• Nominatim / OpenStreetMap — address autocomplete for restaurant submissions. Queries are anonymous.\n• Expo — app framework and push notification delivery\n\nHalalForMe is not responsible for the availability, accuracy, or conduct of any third-party service.',
  },
  {
    title: '11. Prohibited Conduct',
    body: 'You agree not to:\n• Submit false, misleading, or fabricated halal certification claims\n• Upload photos or content you do not own or have rights to\n• Harass, threaten, defame, or harm other users\n• Impersonate any person, business, or certifying authority\n• Use the App for any unlawful purpose or in violation of any applicable law\n• Attempt to gain unauthorised access to our systems, servers, or databases\n• Scrape, crawl, copy, or redistribute App content without prior written permission\n• Use automated tools or bots to interact with the App\n• Circumvent, disable, or interfere with security-related features of the App\n• Submit false, malicious, or bad-faith content reports against other users\n• Attempt to misuse the block or report features to target, silence, or harm other users\n• Submit duplicate, fabricated, or low-quality content with the primary intent of accumulating points or badges rather than contributing genuine information to the community\n\nViolation of any of the above may result in immediate account termination.',
  },
  {
    title: '12. Intellectual Property',
    body: 'The HalalForMe name, logo, app design, interface, and all original content created by HalalForMe are the exclusive property of HalalForMe and are protected by applicable intellectual property laws.\n\nUser Content remains the property of the submitting user, subject to the licence granted in Section 5. You retain ownership of your original photos; however, by uploading them you grant HalalForMe the right to display them within the App.\n\nNothing in these Terms transfers ownership of any intellectual property to you.',
  },
  {
    title: '13. Account Suspension & Termination',
    body: 'HalalForMe reserves the right to suspend or permanently terminate your account at any time, for any reason, including but not limited to violation of these Terms, at our sole discretion and without prior notice or obligation to provide an explanation.\n\nWe are not liable to you or any third party for any termination of your account or access to the App.\n\nYou may delete your own account at any time from the Profile section of the App. Upon deletion, your personal data will be handled in accordance with our Privacy Policy.',
  },
  {
    title: '14. Disclaimer of Warranties',
    body: 'THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.\n\nTo the fullest extent permitted by law, HalalForMe disclaims all warranties including but not limited to:\n• Implied warranties of merchantability and fitness for a particular purpose\n• Warranties that the App will be uninterrupted, error-free, or free of viruses\n• Warranties regarding the accuracy, reliability, or completeness of any content\n\nYour use of the App is at your sole risk.',
  },
  {
    title: '15. Limitation of Liability',
    body: 'To the maximum extent permitted by applicable law, HalalForMe and its operators shall not be liable for any:\n• Indirect, incidental, special, punitive, or consequential damages\n• Loss of data, revenue, profits, or goodwill\n• Harm arising from reliance on halal status information in the App\n• Damages resulting from user-submitted content, including copyright infringement by users\n• Service interruptions or technical failures\n\nIn no event shall HalalForMe\'s total liability to you exceed the amount you paid to use the App in the 12 months preceding the claim (which, for a free app, is $0).',
  },
  {
    title: '16. Indemnification',
    body: 'You agree to indemnify, defend, and hold harmless HalalForMe and its operators from and against any and all claims, damages, losses, costs, and expenses (including reasonable legal fees) arising out of or related to:\n• Your use of the App\n• Your User Content, including any photos you upload\n• Your violation of these Terms\n• Your infringement of any third-party intellectual property, privacy, or other rights\n• Any false or misleading information you submit\n\nThis indemnification obligation survives termination of your account.',
  },
  {
    title: '17. Dispute Resolution & Arbitration',
    body: 'PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS YOUR LEGAL RIGHTS.\n\nFor any dispute, claim, or controversy arising out of or relating to these Terms or your use of the App, you and HalalForMe agree to first attempt to resolve the dispute informally by contacting infor.halalforme@gmail.com.\n\nIf the dispute is not resolved within 30 days, both parties agree to resolve it through binding individual arbitration under the American Arbitration Association (AAA) rules, rather than in court.\n\nCLASS ACTION WAIVER: You agree that any arbitration or legal proceeding shall be conducted on an individual basis only. You waive your right to participate in any class action lawsuit or class-wide arbitration against HalalForMe.\n\nThis arbitration agreement does not apply to claims involving intellectual property rights, which may be brought in court.',
  },
  {
    title: '18. California Privacy Rights (CCPA)',
    body: 'If you are a California resident, you have the following rights under the California Consumer Privacy Act (CCPA):\n\n• Right to Know — You may request disclosure of the personal information we collect, use, and share about you\n• Right to Delete — You may request deletion of your personal information, subject to certain exceptions\n• Right to Opt-Out — HalalForMe does not sell your personal information to third parties. There is nothing to opt out of.\n• Right to Non-Discrimination — We will not discriminate against you for exercising any of your CCPA rights\n\nTo exercise your California privacy rights, contact us at infor.halalforme@gmail.com.',
  },
  {
    title: '19. Governing Law',
    body: 'These Terms of Service shall be governed by and construed in accordance with the laws of the State of California, United States, without regard to its conflict of law provisions.\n\nTo the extent any dispute is not subject to arbitration under Section 17, you agree to submit to the exclusive jurisdiction of the state and federal courts located in California.',
  },
  {
    title: '20. Changes to These Terms',
    body: 'We may update these Terms of Service from time to time. When we do, we will revise the "Last Updated" date at the top of this page.\n\nFor significant changes, we will notify you via an in-app notification or email. Your continued use of the App after any changes constitutes your acceptance of the updated Terms.\n\nIf you do not agree to the updated Terms, you must stop using the App and delete your account.',
  },
  {
    title: '21. Severability',
    body: 'If any provision of these Terms is found to be unenforceable or invalid by a court of competent jurisdiction, that provision will be limited or eliminated to the minimum extent necessary, and the remaining provisions of these Terms will remain in full force and effect.',
  },
  {
    title: '22. Contact',
    body: 'For any questions, concerns, copyright complaints, or legal notices regarding these Terms of Service, please contact us at:\n\nEmail: infor.halalforme@gmail.com\n\nWe aim to respond to all enquiries within 7 business days.',
  },
];

export default function TermsOfServiceScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.flex}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Terms of Service</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        <View style={s.introCard}>
          <Ionicons name="reader" size={32} color={GREEN} style={{ marginBottom: 10 }} />
          <Text style={s.introTitle}>Terms of Service</Text>
          <Text style={s.introText}>Last updated: June 2026</Text>
          <Text style={[s.introText, { marginTop: 8 }]}>
            Please read these terms carefully before using HalalForMe. By using the App you agree to be bound by these Terms of Service.
          </Text>
        </View>

        {TOS_SECTIONS.map((section, i) => (
          <View key={i} style={s.section}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <Text style={s.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={s.contactCard}>
          <Ionicons name="mail-outline" size={20} color={GREEN} />
          <Text style={s.contactText}>
            Questions? Email us at{' '}
            <Text style={s.contactEmail}>infor.halalforme@gmail.com</Text>
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f5f5f5' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111' },

  content: { padding: 16, paddingBottom: 40 },

  introCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    alignItems: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  introTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 4 },
  introText: { fontSize: 13, color: '#666', lineHeight: 20, textAlign: 'center' },

  section: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 8 },
  sectionBody: { fontSize: 13, color: '#555', lineHeight: 21 },

  contactCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f0faf6', borderRadius: 12, padding: 14, marginTop: 6,
    borderWidth: 1, borderColor: '#c6e8d6',
  },
  contactText: { flex: 1, fontSize: 13, color: '#555', lineHeight: 20 },
  contactEmail: { color: GREEN, fontWeight: '600' },
});
