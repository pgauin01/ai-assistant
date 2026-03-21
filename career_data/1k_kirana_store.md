# Project: 1K Kirana Store

**Type:** B2B Retail Tech / E-commerce Platform
**Role:** Lead / Senior Full-Stack Developer
**Tech Stack:** React, Node.js, GraphQL, AWS EC2, PHP (Legacy)
**Status:** Completed / Production

## 1. The Elevator Pitch

Led the end-to-end modernization of the 1K Kirana Store platform, migrating a monolithic legacy PHP application to a highly scalable, modular React and Node.js architecture. The platform empowers local retail networks, successfully serving thousands of monthly active users and processing heavy daily transactional volumes with high reliability.

## 2. System Architecture & Design

- **Frontend:** Modular React architecture with strict component standards and testing coverage to ensure high reliability across a diverse array of mobile and web devices used by store owners.
- **Backend:** Node.js backend exposing GraphQL APIs, allowing flexible and efficient data fetching for complex retail workflows (inventory, pricing, orders).
- **Business Logic Layer:** Decoupled, modular business rule engines governing pricing computations, inventory state, promo code application, and multi-step order workflows.
- **Infrastructure:** Deployed and managed natively on AWS EC2 instances, optimized to handle ~50,000 daily API requests.

## 3. Key Technical Challenges & Roadblocks (The STAR Method)

### Challenge 1: The Monolith to Micro-Architecture Migration

- **Situation:** The original platform was built on a legacy PHP architecture that was becoming a bottleneck for feature delivery and could not reliably scale to meet growing user traffic.
- **Task:** Migrate the entire stack to a modern React + Node.js architecture without disrupting the daily operations of active Kirana store owners.
- **Action:** I led a phased migration strategy. I designed the new Node.js and GraphQL APIs deployed on AWS EC2 to incrementally take over traffic from the PHP backend. On the frontend, I established modern architecture standards and built a scalable component library.
- **Result:** Successfully migrated the user base, reliably serving 400–500 Daily Active Users (DAU) and ~5,000 Monthly Active Users (MAU) while handling ~50,000 daily API requests.

### Challenge 2: Transactional Consistency at Scale

- **Situation:** E-commerce operations for retail networks require absolute precision. Applying promo codes, updating shared inventory, and processing orders simultaneously can easily lead to race conditions or bad data under high concurrency.
- **Task:** Guarantee transactional consistency across all business workflows regardless of server load.
- **Action:** I architected modular business rule engines dedicated explicitly to pricing, inventory, and order workflows. By decoupling these domains, I ensured that database transactions were strictly isolated and locked appropriately during high-concurrency operations.
- **Result:** Maintained pristine data integrity for thousands of daily retail transactions, eliminating phantom inventory issues and pricing discrepancies.

### Challenge 3: Team Velocity & Codebase Brittle-ness

- **Situation:** As the engineering team grew, the lack of standardization in the frontend codebase led to bugs in production and slow feature delivery.
- **Task:** Improve overall application reliability while scaling the engineering team's output.
- **Action:** I took on a heavy mentorship role, guiding 4–5 junior developers. I established strict frontend architecture standards, enforced rigorous code reviews, and led a structured refactoring effort to break down monolithic views into highly modular, testable components.
- **Result:** Improved frontend reliability by ~20%, significantly reduced bug regressions, and accelerated overall delivery velocity by upskilling the junior engineering team.

## 4. Trade-offs & Engineering Decisions

- **Why GraphQL over REST:** Selected GraphQL for the Node.js backend because retail platforms require highly relational, nested data (e.g., an Order contains Users, Products, Promo Codes, and Store details). GraphQL prevented massive over-fetching and allowed the frontend to request exact payloads, drastically reducing mobile bandwidth consumption for store owners on poor network connections.
- **Why AWS EC2 (IaaS) over Managed Services:** Chose to deploy directly on EC2 to maintain granular control over the Node.js runtime environments, routing, and cost optimization during the early phases of the migration, rather than being locked into the constraints of a PaaS (like Heroku or Elastic Beanstalk).

## 5. Impact & Metrics

- **Scale:** Handled 400–500 DAU, ~5,000 MAU, and ~50,000 daily API requests without degradation.
- **Reliability:** Quantifiably improved frontend stability and crash-free sessions by ~20%.
- **Leadership:** Successfully upskilled 4-5 junior developers into autonomous contributors.

## 6. What I Would Do Differently Next Time

- **Infrastructure Evolution:** While AWS EC2 provided great control initially, if I were to scale this platform to 50,000+ DAU today, I would migrate the deployment strategy to container orchestration using Docker and Kubernetes (EKS) or AWS ECS. This would allow for better auto-scaling during retail rush hours and self-healing deployments compared to managing raw EC2 instances.
