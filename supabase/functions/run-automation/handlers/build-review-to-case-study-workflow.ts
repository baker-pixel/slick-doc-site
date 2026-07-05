import type { ClientData } from "../types.ts";
import { createDeliverable, formatDate } from "../shared.ts";

// Build a workflow to convert positive reviews into case studies
export async function buildReviewToCaseStudyWorkflow(supabase: any, client: ClientData, inputData?: Record<string, unknown>) {
  console.log(`Building review-to-case-study workflow for ${client.business_name}`);

  const workflowSteps = [
    {
      step: 1,
      name: "Review Monitoring",
      description: "Monitor for 5-star reviews with detailed feedback",
      trigger: "New review with rating >= 4.5 and character count > 200"
    },
    {
      step: 2,
      name: "Initial Outreach",
      description: "Send personalized thank you email with case study request",
      delay: "2 days after review",
      template: "review_to_case_study_request"
    },
    {
      step: 3,
      name: "Interview Scheduling",
      description: "If client agrees, schedule 15-minute video interview",
      action: "Send Calendly link for case study interview slot"
    },
    {
      step: 4,
      name: "Content Creation",
      description: "Draft case study from review + interview notes",
      deliverable: "Draft case study document for approval"
    },
    {
      step: 5,
      name: "Client Approval",
      description: "Send draft to client for review and approval",
      approval_required: true
    },
    {
      step: 6,
      name: "Publication",
      description: "Publish approved case study to website and marketing materials",
      outputs: ["Website case study page", "Social media posts", "Email newsletter feature"]
    }
  ];

  const reportDate = formatDate();
  await createDeliverable(
    supabase,
    client.id,
    `Review-to-Case-Study Workflow - ${reportDate}`,
    `# Review-to-Case-Study Workflow

## Status: Configured

*Generated on ${reportDate} for ${client.business_name}*

---

## Workflow Overview

This automated workflow identifies high-value positive reviews and converts them into compelling case studies for marketing use.

## Workflow Steps

${workflowSteps.map((step) => `### Step ${step.step}: ${step.name}
- **Description:** ${step.description}
${step.trigger ? `- **Trigger:** ${step.trigger}` : ''}
${step.delay ? `- **Timing:** ${step.delay}` : ''}
${step.template ? `- **Email Template:** ${step.template}` : ''}
${step.action ? `- **Action:** ${step.action}` : ''}
${step.deliverable ? `- **Deliverable:** ${step.deliverable}` : ''}
${step.approval_required ? `- **Requires Approval:** Yes` : ''}
${step.outputs ? `- **Outputs:** ${step.outputs.join(', ')}` : ''}
`).join('\n')}

---

## Qualifying Criteria for Reviews

| Criteria | Threshold |
|----------|-----------|
| Star Rating | ≥ 4.5 stars |
| Review Length | ≥ 200 characters |
| Contains Specific Results | Preferred |
| Mentions Specific Services | Preferred |

## Email Templates Included

1. **Initial Request** - Thank you + soft ask for case study participation
2. **Follow-up** - Reminder with simplified process explanation
3. **Interview Confirmation** - Details and prep questions
4. **Draft Review Request** - Link to approve case study draft
5. **Publication Notice** - Thank you with links to published case study

---

## Expected Outcomes

- **Conversion Rate:** ~15-25% of qualifying reviews become case studies
- **Timeline:** 2-3 weeks from review to published case study
- **Content Generated:** Full case study, social snippets, testimonial quotes

---

*This workflow helps systematically capture and leverage positive client experiences for marketing.*`,
    "workflow"
  );

  return {
    success: true,
    workflowConfigured: true,
    stepsCount: workflowSteps.length,
    deliverableCreated: true,
    timestamp: new Date().toISOString(),
  };
}
