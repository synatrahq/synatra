INSERT INTO users (name, username, email, phone, website, company_name, company_catchphrase, address_street, address_city, address_zipcode) VALUES
('Leanne Graham', 'bret', 'leanne@example.com', '1-770-736-8031', 'hildegard.org', 'Romaguera-Crona', 'Multi-layered client-server neural-net', 'Kulas Light', 'Gwenborough', '92998-3874'),
('Ervin Howell', 'antonette', 'ervin@example.com', '010-692-6593', 'anastasia.net', 'Deckow-Crist', 'Proactive didactic contingency', 'Victor Plains', 'Wisokyburgh', '90566-7771'),
('Clementine Bauch', 'samantha', 'clementine@example.com', '1-463-123-4447', 'ramiro.info', 'Romaguera-Jacobson', 'Face to face bifurcated interface', 'Douglas Extension', 'McKenziehaven', '59590-4157'),
('Patricia Lebsack', 'karianne', 'patricia@example.com', '493-170-9623', 'kale.biz', 'Robel-Corkery', 'Multi-tiered zero tolerance productivity', 'Hoeger Mall', 'South Elvis', '53919-4257'),
('Chelsey Dietrich', 'kamren', 'chelsey@example.com', '(254)954-1289', 'demarco.info', 'Keebler LLC', 'User-centric fault-tolerant solution', 'Skiles Walks', 'Roscoeview', '33263'),
('Tanaka Yuki', 'tanaka_y', 'tanaka@example.jp', '03-1234-5678', 'tanaka.co.jp', 'Tanaka Industries', 'Innovation through collaboration', 'Shibuya 1-2-3', 'Tokyo', '150-0002'),
('Sato Kenji', 'sato_k', 'sato@example.jp', '06-9876-5432', 'sato-tech.jp', 'Sato Technologies', 'Building the future today', 'Umeda 4-5-6', 'Osaka', '530-0001'),
('Dennis Schulist', 'leopoldo', 'dennis@example.com', '1-477-935-8478', 'ola.org', 'Considine-Lockman', 'Synchronised bottom-line interface', 'Norberto Crossing', 'South Christy', '23505-1337'),
('Kurtis Weissnat', 'elwyn', 'kurtis@example.com', '210.067.6132', 'elvis.io', 'Johns Group', 'Configurable multimedia task-force', 'Rex Trail', 'Howemouth', '58804-1099'),
('Suzuki Hanako', 'suzuki_h', 'suzuki@example.jp', '052-111-2222', 'suzuki.dev', 'Suzuki Software', 'Code with passion', 'Sakae 7-8-9', 'Nagoya', '460-0008');

INSERT INTO posts (user_id, title, body) VALUES
(1, 'Introduction to TypeScript', 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. It offers classes, modules, and interfaces to help you build robust components.'),
(1, 'Why We Chose PostgreSQL', 'After evaluating several database options, we decided PostgreSQL was the best fit for our needs. Here is our analysis and decision process.'),
(2, 'Building REST APIs with Hono', 'Hono is a small, simple, and ultrafast web framework for the Edges. Let me show you how to build a REST API with it.'),
(2, 'Docker Compose for Development', 'Setting up a local development environment with Docker Compose can save hours of configuration. Here is our setup.'),
(3, 'State Management in React', 'Comparing different state management solutions: Redux, Zustand, Jotai, and React Query. Which one should you choose?'),
(3, 'Testing Best Practices', 'Writing tests is crucial for maintaining code quality. Here are our best practices for unit and integration testing.'),
(4, 'Microservices vs Monolith', 'The eternal debate: when should you use microservices and when is a monolith the better choice?'),
(5, 'CI/CD Pipeline Setup', 'Automating your deployment pipeline with GitHub Actions. A step-by-step guide.'),
(6, 'Japanese Tech Industry Trends', 'An overview of the latest technology trends in the Japanese tech industry for 2024.'),
(7, 'AI Integration Patterns', 'How to integrate AI capabilities into your existing applications without a complete rewrite.'),
(8, 'Database Migration Strategies', 'Safely migrating your database schema in production without downtime.'),
(9, 'Performance Optimization Tips', 'Ten tips to improve your web application performance today.'),
(10, 'Remote Work Best Practices', 'Lessons learned from running a fully remote engineering team.');

INSERT INTO comments (post_id, name, email, body) VALUES
(1, 'Great introduction!', 'reader1@example.com', 'This helped me understand TypeScript better. Thanks for the clear explanation!'),
(1, 'Question about generics', 'reader2@example.com', 'Could you write a follow-up post about TypeScript generics?'),
(2, 'PostgreSQL fan here', 'dbadmin@example.com', 'Great choice! PostgreSQL has been rock solid for us too.'),
(3, 'Hono is amazing', 'dev@example.com', 'We switched from Express to Hono and never looked back.'),
(4, 'Docker question', 'newbie@example.com', 'How do you handle volume permissions on Linux?'),
(5, 'Zustand recommendation', 'frontend@example.com', 'We use Zustand and love its simplicity.'),
(6, 'Testing is important', 'qa@example.com', 'Cannot stress enough how important testing is. Great article!'),
(7, 'Monolith first', 'architect@example.com', 'I always recommend starting with a monolith and extracting services as needed.'),
(8, 'GitHub Actions tips', 'devops@example.com', 'Don''t forget to cache your dependencies for faster builds!'),
(9, 'Thanks for sharing', 'reader@example.jp', 'Very insightful overview of the Japanese tech scene.'),
(10, 'AI is the future', 'mleng@example.com', 'These patterns are exactly what we needed for our AI integration project.');

INSERT INTO albums (user_id, title) VALUES
(1, 'Project Screenshots'),
(1, 'Team Events 2024'),
(2, 'Architecture Diagrams'),
(3, 'UI Designs'),
(4, 'Conference Photos'),
(6, 'Tokyo Office'),
(7, 'Osaka Meetup'),
(10, 'Product Launch');

INSERT INTO photos (album_id, title, url, thumbnail_url) VALUES
(1, 'Dashboard v1', 'https://picsum.photos/600/400?random=1', 'https://picsum.photos/150/100?random=1'),
(1, 'Dashboard v2', 'https://picsum.photos/600/400?random=2', 'https://picsum.photos/150/100?random=2'),
(1, 'Settings Page', 'https://picsum.photos/600/400?random=3', 'https://picsum.photos/150/100?random=3'),
(2, 'Team Dinner', 'https://picsum.photos/600/400?random=4', 'https://picsum.photos/150/100?random=4'),
(2, 'Hackathon', 'https://picsum.photos/600/400?random=5', 'https://picsum.photos/150/100?random=5'),
(3, 'System Architecture', 'https://picsum.photos/600/400?random=6', 'https://picsum.photos/150/100?random=6'),
(3, 'Data Flow', 'https://picsum.photos/600/400?random=7', 'https://picsum.photos/150/100?random=7'),
(4, 'Mobile Design', 'https://picsum.photos/600/400?random=8', 'https://picsum.photos/150/100?random=8'),
(4, 'Desktop Design', 'https://picsum.photos/600/400?random=9', 'https://picsum.photos/150/100?random=9'),
(5, 'Keynote Speaker', 'https://picsum.photos/600/400?random=10', 'https://picsum.photos/150/100?random=10'),
(6, 'Office View', 'https://picsum.photos/600/400?random=11', 'https://picsum.photos/150/100?random=11'),
(7, 'Meetup Group', 'https://picsum.photos/600/400?random=12', 'https://picsum.photos/150/100?random=12'),
(8, 'Launch Event', 'https://picsum.photos/600/400?random=13', 'https://picsum.photos/150/100?random=13');

INSERT INTO todos (user_id, title, completed) VALUES
(1, 'Review pull requests', true),
(1, 'Update documentation', false),
(1, 'Fix login bug', true),
(1, 'Deploy to staging', false),
(2, 'Write API tests', true),
(2, 'Refactor auth module', false),
(2, 'Update dependencies', true),
(3, 'Design new landing page', false),
(3, 'Create component library', true),
(4, 'Setup monitoring', false),
(4, 'Configure alerts', false),
(5, 'Write blog post', true),
(5, 'Record demo video', false),
(6, 'Prepare presentation', true),
(6, 'Book meeting room', true),
(7, 'Code review', false),
(7, 'Merge feature branch', false),
(8, 'Database backup', true),
(9, 'Performance testing', false),
(10, 'Team standup notes', true);
