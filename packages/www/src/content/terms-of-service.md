# TERMS OF SERVICE

Last updated: 2026/1/15

## AGREEMENT TO OUR LEGAL TERMS

We are Querier, Inc. ("Company," "we," "us," "our").

We operate the Synatra platform, including our website, cloud services, and any other related products and services that refer or link to these legal terms (the "Legal Terms") (collectively, the "Services").

Synatra is an AI agent platform that enables you to connect your data sources and build intelligent automation workflows powered by large language models.

You can contact us by email at legal@synatrahq.com or by mail to Hamamatsu-Cho-Daiya-Building 2F, Hamamatsu-Cho 2-2-15, Minato-ku, Tokyo.

These Legal Terms constitute a legally binding agreement made between you, whether personally or on behalf of an entity ("you"), and Querier, Inc., concerning your access to and use of the Services. You agree that by accessing the Services, you have read, understood, and agreed to be bound by all of these Legal Terms. IF YOU DO NOT AGREE WITH ALL OF THESE LEGAL TERMS, THEN YOU ARE EXPRESSLY PROHIBITED FROM USING THE SERVICES AND YOU MUST DISCONTINUE USE IMMEDIATELY.

Supplemental terms and conditions or documents that may be posted on the Services from time to time are hereby expressly incorporated herein by reference. We reserve the right, in our sole discretion, to make changes or modifications to these Legal Terms at any time and for any reason. We will alert you about any changes by updating the "Last updated" date of these Legal Terms, and you waive any right to receive specific notice of each such change. It is your responsibility to periodically review these Legal Terms to stay informed of updates. You will be subject to, and will be deemed to have been made aware of and to have accepted, the changes in any revised Legal Terms by your continued use of the Services after the date such revised Legal Terms are posted.

We recommend that you print a copy of these Legal Terms for your records.

## 1. OUR SERVICES

### 1.1 Service Description

Synatra provides a cloud-based platform that enables users to:

- Connect to external data sources (including but not limited to PostgreSQL, MySQL, REST APIs, Stripe, GitHub, and Intercom)
- Build and deploy AI agents powered by third-party large language model (LLM) providers
- Automate workflows and data operations through natural language interactions
- Configure triggers and scheduled tasks for automated agent execution

### 1.2 Self-Hosted Option

Synatra is also available as open-source software that you may self-host on your own infrastructure. These Legal Terms apply specifically to the cloud-hosted Services. Self-hosted deployments are subject to the applicable open-source license.

**Self-Hosted Disclaimer.** IF YOU USE THE SELF-HOSTED VERSION OF SYNATRA, YOU ACKNOWLEDGE AND AGREE THAT:

- THE OPEN-SOURCE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND
- WE ARE NOT RESPONSIBLE FOR ANY DATA LOSS, CORRUPTION, SECURITY BREACHES, OR OTHER DAMAGES ARISING FROM YOUR USE OF THE SELF-HOSTED VERSION
- YOU ARE SOLELY RESPONSIBLE FOR THE SECURITY, CONFIGURATION, MAINTENANCE, AND BACKUP OF YOUR SELF-HOSTED DEPLOYMENT
- OPERATIONS PERFORMED THROUGH THE SELF-HOSTED SOFTWARE (INCLUDING AI AGENTS, TRIGGERS, AND WORKFLOWS) MAY MODIFY, DELETE, OR CORRUPT DATA IN YOUR CONNECTED DATA SOURCES
- WE PROVIDE NO SUPPORT, UPDATES, OR MAINTENANCE OBLIGATIONS FOR SELF-HOSTED DEPLOYMENTS UNLESS SEPARATELY AGREED IN WRITING
- THE DISCLAIMERS AND LIMITATIONS OF LIABILITY SET FORTH IN SECTIONS 15 AND 16 OF THESE LEGAL TERMS APPLY TO YOUR USE OF THE SELF-HOSTED SOFTWARE TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW

### 1.3 Geographic Availability

The information provided when using the Services is not intended for distribution to or use by any person or entity in any jurisdiction or country where such distribution or use would be contrary to law or regulation or which would subject us to any registration requirement within such jurisdiction or country. Accordingly, those persons who choose to access the Services from other locations do so on their own initiative and are solely responsible for compliance with local laws, if and to the extent local laws are applicable.

## 2. ACCOUNT REGISTRATION AND ORGANIZATION

### 2.1 Account Creation

To access the Services, you must register for an account. You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate, current, and complete.

### 2.2 Organizations

Services are provided at the organization level. You may create or join organizations, and access to resources is scoped to your organization membership. Organization owners and administrators are responsible for managing member access and permissions.

### 2.3 Account Security

You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized access to or use of your account. We will not be liable for any loss or damage arising from your failure to protect your account credentials.

## 3. SUBSCRIPTION PLANS AND BILLING

### 3.1 Subscription Plans

We offer various subscription plans with different features, usage limits, and pricing. Details of current plans are available on our website. We reserve the right to modify plan features and pricing at any time, with reasonable notice to existing subscribers.

### 3.2 Usage-Based Billing

Certain aspects of the Services are billed based on usage, including but not limited to the number of agent runs executed. Usage limits and overage rates are specified in your subscription plan. You are responsible for monitoring your usage and understand that exceeding plan limits may result in additional charges.

### 3.3 Payment Processing

All payments are processed through Stripe in United States Dollars (USD). By subscribing to a paid plan, you authorize us to charge your designated payment method for all applicable fees. You are responsible for providing valid payment information and ensuring sufficient funds are available.

### 3.4 Refunds and Cancellations

You may cancel your subscription at any time. Upon cancellation, your subscription will remain active until the end of your current billing period. We do not provide refunds for partial billing periods or unused portions of your subscription.

## 4. DATA AND CREDENTIALS

### 4.1 Your Data Sources

The Services allow you to connect to your external data sources by providing connection credentials. You represent and warrant that:

- You have all necessary rights and permissions to connect such data sources to the Services
- Your use of the data accessed through such connections complies with all applicable laws and third-party terms of service
- You will not use the Services to access data that you are not authorized to access

### 4.2 Credential Security

We encrypt all data source credentials using AES-256-GCM encryption at rest. Credentials are decrypted only in isolated services at the time of connection and are never logged. However, you acknowledge that no method of electronic storage or transmission is 100% secure, and we cannot guarantee absolute security.

### 4.3 Data Processing by AI Providers

When you use AI agents, data from your connected sources may be sent to third-party LLM providers (such as OpenAI, Anthropic, or Google) for processing. You acknowledge and consent to this data transfer as necessary for the Services to function. You are responsible for ensuring that such data transfers comply with your own privacy obligations and any applicable laws.

### 4.4 Data Operations and Modifications

The Services may perform operations on your connected data sources, including but not limited to reading, creating, updating, and deleting data. These operations may be initiated through AI agents, triggers, workflows, or other features of the Services.

**Potential Risks.** Operations performed through the Services may cause unintended consequences, including but not limited to:

- Incorrect data being written to your databases
- Unintended deletion of records
- Data corruption due to malformed operations
- Cascading effects on related data or systems

**Your Responsibilities.** You acknowledge and agree that:

- **You are solely responsible for the configuration and permissions granted through the Services.** You should configure appropriate access controls and permissions for each data source connection.
- **Data modifications performed through the Services are at your own risk.** We are not responsible for any data loss, corruption, or unintended modifications resulting from operations executed through the Services.
- **You should maintain independent backups of your data.** We do not backup your external data sources and are not responsible for data recovery.

**Recommendations.** We strongly recommend:

- Using read-only connections where write access is not required
- Enabling human approval workflows for operations that modify data, particularly in production environments
- Testing configurations in non-production environments before connecting production data sources
- Maintaining regular backups independent of our Services

### 4.5 No Data Training

We do not use your data, prompts, or agent outputs to train generalized AI or machine learning models. Data processed through the Services is used solely to provide the Services to you.

## 5. INTELLECTUAL PROPERTY RIGHTS

### 5.1 Our Intellectual Property

We are the owner or the licensee of all intellectual property rights in our Services, including all source code (excluding open-source components), databases, functionality, software, website designs, audio, video, text, photographs, and graphics in the Services (collectively, the "Content"), as well as the trademarks, service marks, and logos contained therein (the "Marks").

Our Content and Marks are protected by copyright and trademark laws and treaties in the United States, Japan, and around the world. The Content and Marks are provided in or through the Services "AS IS" for your internal business purpose only.

### 5.2 Your Use of Our Services

Subject to your compliance with these Legal Terms, we grant you a non-exclusive, non-transferable, revocable license to:

- Access the Services; and
- Use the Services for your internal business purposes.

Except as set out in this section or elsewhere in our Legal Terms, no part of the Services and no Content or Marks may be copied, reproduced, aggregated, republished, uploaded, posted, publicly displayed, encoded, translated, transmitted, distributed, sold, licensed, or otherwise exploited for any commercial purpose whatsoever, without our express prior written permission.

### 5.3 Your Content and Outputs

You retain all ownership rights to:

- Data you provide or connect to the Services
- Prompts and configurations you create
- Outputs generated by AI agents using your data

We claim no ownership over your content or outputs.

**AI Output Intellectual Property Disclaimer.** While we claim no ownership over AI-generated outputs, the legal status of copyright and other intellectual property protection for AI-generated content varies by jurisdiction and remains an evolving area of law. We make no representations or warranties regarding the intellectual property status of AI outputs. You should consult qualified legal counsel regarding the intellectual property implications of AI-generated content in your jurisdiction before relying on such outputs for commercial purposes.

### 5.4 Your Submissions

Please review this section carefully to understand the rights you give us and obligations you have when you post or upload any content through the Services.

**Submissions.** By directly sending us any question, comment, suggestion, idea, feedback, or other information about the Services ("Submissions"), you agree to assign to us all intellectual property rights in such Submission. You agree that we shall own this Submission and be entitled to its unrestricted use and dissemination for any lawful purpose, commercial or otherwise, without acknowledgment or compensation to you.

**Your Responsibilities.** By sending us Submissions through any part of the Services you:

- Confirm that you have read and agree with our "PROHIBITED ACTIVITIES" and will not post, send, publish, upload, or transmit through the Services any Submission that is illegal, harassing, hateful, harmful, defamatory, obscene, abusive, discriminatory, threatening to any person or group, sexually explicit, false, inaccurate, deceitful, or misleading
- To the extent permissible by applicable law, waive any and all moral rights to any such Submission
- Warrant that any such Submissions are original to you or that you have the necessary rights and licenses to submit such Submissions and that you have full authority to grant us the above-mentioned rights in relation to your Submissions
- Warrant and represent that your Submissions do not constitute confidential information

You are solely responsible for your Submissions and you expressly agree to reimburse us for any and all losses that we may suffer because of your breach of (a) this section, (b) any third party's intellectual property rights, or (c) applicable law.

### 5.5 Customer References

By using the Services as a business entity, you grant us a non-exclusive, worldwide, royalty-free license to use your company name, logo, and trademarks solely for the purpose of identifying you as a customer in our marketing materials. You may revoke this permission at any time by sending written notice to legal@synatrahq.com, and we will remove your references within 30 days.

## 6. USER REPRESENTATIONS

By using the Services, you represent and warrant that:

1. You have the legal capacity and authority to agree to these Legal Terms
2. If acting on behalf of an entity, you have the authority to bind that entity
3. You are not a minor in the jurisdiction in which you reside
4. You will not access the Services through automated means except as expressly permitted
5. You will not use the Services for any illegal or unauthorized purpose
6. Your use of the Services will not violate any applicable law or regulation

If you provide any information that is untrue, inaccurate, not current, or incomplete, we have the right to suspend or terminate your account and refuse any and all current or future use of the Services.

## 7. PROHIBITED ACTIVITIES

You may not access or use the Services for any purpose other than that for which we make the Services available. The Services may not be used in connection with any commercial endeavors except those that are specifically endorsed or approved by us.

As a user of the Services, you agree not to:

1. Use the Services to process, store, or transmit data in violation of any applicable law or third-party rights
2. Attempt to gain unauthorized access to any data sources, systems, or networks connected through the Services
3. Use the Services to build AI agents that generate harmful, illegal, discriminatory, or misleading content
4. Circumvent, disable, or interfere with security-related features of the Services, including features that prevent or restrict the use or copying of any Content or enforce limitations on the use of the Services
5. Use the Services in a manner that could damage, disable, overburden, or impair our systems or the networks connected to the Services
6. Systematically retrieve data or other content from the Services to create or compile, directly or indirectly, a collection, compilation, database, or directory without written permission from us
7. Attempt to reverse engineer, decompile, or disassemble any part of the Services (except as permitted by applicable law)
8. Use the Services to harass, abuse, or harm any person
9. Share your account credentials with unauthorized third parties
10. Resell or redistribute access to the Services without our written consent
11. Use the Services to violate the terms of service of any connected third-party platform
12. Trick, defraud, or mislead us and other users, especially in any attempt to learn sensitive account information
13. Disparage, tarnish, or otherwise harm, in our opinion, us and/or the Services
14. Make improper use of our support services or submit false reports of abuse or misconduct
15. Engage in unauthorized framing of or linking to the Services
16. Upload or transmit viruses, Trojan horses, or other malicious code that interferes with any party's use of the Services
17. Delete the copyright or other proprietary rights notice from any Content
18. Attempt to impersonate another user or person or use the username of another user
19. Upload or transmit any material that acts as a passive or active information collection or transmission mechanism, including spyware, web bugs, or similar devices
20. Use any automated system, including robots, spiders, or scrapers, to access the Services without our permission (except as may result from standard search engine or browser usage)
21. Collect usernames or email addresses of users for the purpose of sending unsolicited communications
22. Use the Services as part of any effort to compete with us or otherwise use the Services for any revenue-generating endeavor or commercial enterprise not approved by us

## 8. AI-SPECIFIC TERMS

### 8.1 AI Output Accuracy

AI agents may produce outputs that are inaccurate, incomplete, or inappropriate. You acknowledge that:

- AI outputs should be reviewed by qualified personnel before being acted upon
- We do not guarantee the accuracy, reliability, or appropriateness of any AI-generated content
- You are solely responsible for how you use AI outputs in your business operations

### 8.2 Human Oversight

You agree to implement appropriate human oversight for AI agent operations, particularly for actions that could have significant consequences. The Services provide features for human-in-the-loop approval, which we recommend enabling for sensitive operations.

### 8.3 Compliance with AI Regulations

You are responsible for ensuring your use of AI features complies with all applicable laws and regulations, including any AI-specific legislation in your jurisdiction.

## 9. SERVICES MANAGEMENT

We reserve the right, but not the obligation, to:

1. Monitor the Services for violations of these Legal Terms
2. Take appropriate legal action against anyone who, in our sole discretion, violates the law or these Legal Terms, including reporting such user to law enforcement authorities
3. In our sole discretion and without limitation, refuse, restrict access to, limit the availability of, or disable any of your content or any portion thereof
4. In our sole discretion and without limitation, notice, or liability, remove from the Services or otherwise disable all files and content that are excessive in size or are in any way burdensome to our systems
5. Otherwise manage the Services in a manner designed to protect our rights and property and to facilitate the proper functioning of the Services

## 10. TERM AND TERMINATION

### 10.1 Term

These Legal Terms shall remain in full force and effect while you use the Services.

### 10.2 Termination by You

You may terminate your account at any time by contacting us or using the account deletion features in the Services.

### 10.3 Termination by Us

WITHOUT LIMITING ANY OTHER PROVISION OF THESE LEGAL TERMS, WE RESERVE THE RIGHT TO, IN OUR SOLE DISCRETION AND WITHOUT NOTICE OR LIABILITY, DENY ACCESS TO AND USE OF THE SERVICES (INCLUDING BLOCKING CERTAIN IP ADDRESSES), TO ANY PERSON FOR ANY REASON OR FOR NO REASON, INCLUDING WITHOUT LIMITATION FOR BREACH OF ANY REPRESENTATION, WARRANTY, OR COVENANT CONTAINED IN THESE LEGAL TERMS OR OF ANY APPLICABLE LAW OR REGULATION. WE MAY TERMINATE YOUR USE OR PARTICIPATION IN THE SERVICES OR DELETE ANY CONTENT OR INFORMATION THAT YOU POSTED AT ANY TIME, WITHOUT WARNING, IN OUR SOLE DISCRETION.

### 10.4 Prohibition on Re-registration

If we terminate or suspend your account for any reason, you are prohibited from registering and creating a new account under your name, a fake or borrowed name, or the name of any third party, even if you may be acting on behalf of the third party. In addition to terminating or suspending your account, we reserve the right to take appropriate legal action, including without limitation pursuing civil, criminal, and injunctive redress.

### 10.5 Effect of Termination

Upon termination:

- Your right to access the Services will immediately cease
- We may delete your account data in accordance with our data retention policies
- Provisions that by their nature should survive termination will remain in effect

## 11. MODIFICATIONS AND INTERRUPTIONS

We reserve the right to change, modify, or remove the contents of the Services at any time or for any reason at our sole discretion without notice. However, we have no obligation to update any information on our Services. We will not be liable to you or any third party for any modification, price change, suspension, or discontinuance of the Services.

We cannot guarantee the Services will be available at all times. We may experience hardware, software, or other problems or need to perform maintenance related to the Services, resulting in interruptions, delays, or errors. We reserve the right to change, revise, update, suspend, discontinue, or otherwise modify the Services at any time or for any reason without notice to you. You agree that we have no liability whatsoever for any loss, damage, or inconvenience caused by your inability to access or use the Services during any downtime or discontinuance of the Services. Nothing in these Legal Terms will be construed to obligate us to maintain and support the Services or to supply any corrections, updates, or releases in connection therewith.

## 12. CORRECTIONS

There may be information on the Services that contains typographical errors, inaccuracies, or omissions, including descriptions, pricing, availability, and various other information. We reserve the right to correct any errors, inaccuracies, or omissions and to change or update the information on the Services at any time, without prior notice.

## 13. GOVERNING LAW

These Legal Terms shall be governed by and defined following the laws of Japan. Querier, Inc. and yourself irrevocably consent that the courts of Tokyo shall have exclusive jurisdiction to resolve any dispute which may arise in connection with these Legal Terms.

## 14. DISPUTE RESOLUTION

### 14.1 Informal Negotiations

To expedite resolution and control the cost of any dispute, controversy, or claim related to these Legal Terms (each a "Dispute"), the Parties agree to first attempt to negotiate any Dispute informally for at least thirty (30) days before initiating arbitration. Such informal negotiations commence upon written notice from one Party to the other Party.

### 14.2 Binding Arbitration

Any dispute arising out of or in connection with these Legal Terms, including any question regarding its existence, validity, or termination, shall be referred to and finally resolved by arbitration in accordance with the Commercial Arbitration Rules of the Japan Commercial Arbitration Association (JCAA). The seat of arbitration shall be Tokyo, Japan. The language of the proceedings shall be English. The governing law of these Legal Terms shall be the substantive law of Japan.

### 14.3 Restrictions

The Parties agree that any arbitration shall be limited to the Dispute between the Parties individually. To the full extent permitted by law:

- No arbitration shall be joined with any other proceeding
- There is no right or authority for any Dispute to be arbitrated on a class-action basis
- There is no right or authority for any Dispute to be brought in a purported representative capacity

### 14.4 Exceptions

The following Disputes are not subject to binding arbitration:

- Any Disputes seeking to enforce or protect intellectual property rights
- Any Dispute related to allegations of theft, piracy, or unauthorized use
- Any claim for injunctive relief

If this provision is found to be illegal or unenforceable, then neither Party will elect to arbitrate any Dispute falling within that portion of this provision found to be illegal or unenforceable and such Dispute shall be decided by a court of competent jurisdiction within the courts listed for jurisdiction above, and the Parties agree to submit to the personal jurisdiction of that court.

## 15. DISCLAIMER

THE SERVICES ARE PROVIDED ON AN "AS-IS" AND "AS-AVAILABLE" BASIS. YOU AGREE THAT YOUR USE OF THE SERVICES WILL BE AT YOUR SOLE RISK. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, IN CONNECTION WITH THE SERVICES AND YOUR USE THEREOF, INCLUDING, WITHOUT LIMITATION, THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

WE MAKE NO WARRANTIES OR REPRESENTATIONS ABOUT THE ACCURACY OR COMPLETENESS OF THE SERVICES' CONTENT OR THE CONTENT OF ANY WEBSITES OR MOBILE APPLICATIONS LINKED TO THE SERVICES AND WE WILL ASSUME NO LIABILITY OR RESPONSIBILITY FOR ANY (1) ERRORS, MISTAKES, OR INACCURACIES OF CONTENT AND MATERIALS, (2) PERSONAL INJURY OR PROPERTY DAMAGE, OF ANY NATURE WHATSOEVER, RESULTING FROM YOUR ACCESS TO AND USE OF THE SERVICES, (3) ANY UNAUTHORIZED ACCESS TO OR USE OF OUR SECURE SERVERS AND/OR ANY AND ALL PERSONAL INFORMATION AND/OR FINANCIAL INFORMATION STORED THEREIN, (4) ANY INTERRUPTION OR CESSATION OF TRANSMISSION TO OR FROM THE SERVICES, (5) ANY BUGS, VIRUSES, TROJAN HORSES, OR THE LIKE WHICH MAY BE TRANSMITTED TO OR THROUGH THE SERVICES BY ANY THIRD PARTY, AND/OR (6) ANY ERRORS OR OMISSIONS IN ANY CONTENT AND MATERIALS OR FOR ANY LOSS OR DAMAGE OF ANY KIND INCURRED AS A RESULT OF THE USE OF ANY CONTENT POSTED, TRANSMITTED, OR OTHERWISE MADE AVAILABLE VIA THE SERVICES.

WE ADDITIONALLY MAKE NO WARRANTIES OR REPRESENTATIONS ABOUT:

- THE ACCURACY, RELIABILITY, OR APPROPRIATENESS OF ANY AI-GENERATED OUTPUTS
- THE SECURITY OF YOUR DATA SOURCE CONNECTIONS
- THE SAFETY OR CORRECTNESS OF DATA OPERATIONS PERFORMED THROUGH THE SERVICES ON YOUR DATA SOURCES

YOU ACKNOWLEDGE THAT OPERATIONS PERFORMED THROUGH THE SERVICES (INCLUDING AI AGENTS, TRIGGERS, AND WORKFLOWS) MAY MODIFY, DELETE, OR CORRUPT DATA IN YOUR CONNECTED DATA SOURCES. YOU ARE SOLELY RESPONSIBLE FOR MAINTAINING BACKUPS AND IMPLEMENTING APPROPRIATE SAFEGUARDS.

WE DO NOT WARRANT, ENDORSE, GUARANTEE, OR ASSUME RESPONSIBILITY FOR ANY PRODUCT OR SERVICE ADVERTISED OR OFFERED BY A THIRD PARTY THROUGH THE SERVICES, ANY HYPERLINKED WEBSITE, OR ANY WEBSITE OR MOBILE APPLICATION FEATURED IN ANY BANNER OR OTHER ADVERTISING, AND WE WILL NOT BE A PARTY TO OR IN ANY WAY BE RESPONSIBLE FOR MONITORING ANY TRANSACTION BETWEEN YOU AND ANY THIRD-PARTY PROVIDERS OF PRODUCTS OR SERVICES.

## 16. LIMITATIONS OF LIABILITY

IN NO EVENT WILL WE OR OUR DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE TO YOU OR ANY THIRD PARTY FOR ANY DIRECT, INDIRECT, CONSEQUENTIAL, EXEMPLARY, INCIDENTAL, SPECIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFIT, LOST REVENUE, LOSS OF DATA, OR OTHER DAMAGES ARISING FROM YOUR USE OF THE SERVICES, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

NOTWITHSTANDING ANYTHING TO THE CONTRARY CONTAINED HEREIN, OUR LIABILITY TO YOU FOR ANY CAUSE WHATSOEVER AND REGARDLESS OF THE FORM OF THE ACTION, WILL AT ALL TIMES BE LIMITED TO THE AMOUNT PAID, IF ANY, BY YOU TO US DURING THE TWELVE (12) MONTH PERIOD PRIOR TO ANY CAUSE OF ACTION ARISING.

CERTAIN US STATE LAWS AND INTERNATIONAL LAWS DO NOT ALLOW LIMITATIONS ON IMPLIED WARRANTIES OR THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES. IF THESE LAWS APPLY TO YOU, SOME OR ALL OF THE ABOVE DISCLAIMERS OR LIMITATIONS MAY NOT APPLY TO YOU, AND YOU MAY HAVE ADDITIONAL RIGHTS.

CERTAIN JAPANESE LAWS, INCLUDING THE CONSUMER CONTRACT ACT, MAY LIMIT THE ENFORCEABILITY OF CERTAIN DISCLAIMERS OR LIABILITY LIMITATIONS ABOVE WITH RESPECT TO CONSUMERS. TO THE EXTENT PROHIBITED BY APPLICABLE JAPANESE LAW, SUCH LIMITATIONS SHALL NOT APPLY TO YOU.

## 17. INDEMNIFICATION

You agree to defend, indemnify, and hold us harmless, including our subsidiaries, affiliates, and all of our respective officers, agents, partners, and employees, from and against any loss, damage, liability, claim, or demand, including reasonable attorneys' fees and expenses, made by any third party due to or arising out of:

1. Your use of the Services
2. Breach of these Legal Terms
3. Any breach of your representations and warranties set forth in these Legal Terms
4. Your violation of the rights of a third party, including but not limited to intellectual property rights
5. Data you process through the Services that violates any law or third-party rights
6. AI agents you create that cause harm to third parties
7. Any overt harmful act toward any other user of the Services with whom you connected via the Services

Notwithstanding the foregoing, we reserve the right, at your expense, to assume the exclusive defense and control of any matter for which you are required to indemnify us, and you agree to cooperate, at your expense, with our defense of such claims. We will use reasonable efforts to notify you of any such claim, action, or proceeding which is subject to this indemnification upon becoming aware of it.

## 18. USER DATA

We will maintain certain data that you transmit to the Services for the purpose of managing the performance of the Services, as well as data relating to your use of the Services. Although we perform regular routine backups of data, you are solely responsible for all data that you transmit or that relates to any activity you have undertaken using the Services. You agree that we shall have no liability to you for any loss or corruption of any such data, and you hereby waive any right of action against us arising from any such loss or corruption of such data.

Our application does not retain user data obtained through Google Workspace APIs for the purpose of developing, improving, or training generalized AI and/or ML models. We prioritize user privacy and ensure that any data accessed through these APIs is used solely for the intended functionality of our application.

## 19. ELECTRONIC COMMUNICATIONS, TRANSACTIONS, AND SIGNATURES

Visiting the Services, sending us emails, and completing online forms constitute electronic communications. You consent to receive electronic communications, and you agree that all agreements, notices, disclosures, and other communications we provide to you electronically, via email and on the Services, satisfy any legal requirement that such communication be in writing.

YOU HEREBY AGREE TO THE USE OF ELECTRONIC SIGNATURES, CONTRACTS, ORDERS, AND OTHER RECORDS, AND TO ELECTRONIC DELIVERY OF NOTICES, POLICIES, AND RECORDS OF TRANSACTIONS INITIATED OR COMPLETED BY US OR VIA THE SERVICES. You hereby waive any rights or requirements under any statutes, regulations, rules, ordinances, or other laws in any jurisdiction which require an original signature or delivery or retention of non-electronic records, or to payments or the granting of credits by any means other than electronic means.

## 20. MISCELLANEOUS

These Legal Terms and any policies or operating rules posted by us on the Services or in respect to the Services constitute the entire agreement and understanding between you and us. Our failure to exercise or enforce any right or provision of these Legal Terms shall not operate as a waiver of such right or provision. These Legal Terms operate to the fullest extent permissible by law. We may assign any or all of our rights and obligations to others at any time. We shall not be responsible or liable for any loss, damage, delay, or failure to act caused by any cause beyond our reasonable control. If any provision or part of a provision of these Legal Terms is determined to be unlawful, void, or unenforceable, that provision or part of the provision is deemed severable from these Legal Terms and does not affect the validity and enforceability of any remaining provisions. There is no joint venture, partnership, employment or agency relationship created between you and us as a result of these Legal Terms or use of the Services. You agree that these Legal Terms will not be construed against us by virtue of having drafted them. You hereby waive any and all defenses you may have based on the electronic form of these Legal Terms and the lack of signing by the parties hereto to execute these Legal Terms.

## 21. CONTACT US

In order to resolve a complaint regarding the Services or to receive further information regarding use of the Services, please contact us at:

Querier, Inc.
Hamamatsu-Cho-Daiya-Building 2F, Hamamatsu-Cho 2-2-15, Minato-ku, Tokyo
legal@synatrahq.com
