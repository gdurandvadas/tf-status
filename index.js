const axios = require('axios');

/**
 * Terraform Plan PR publisher
 * @param {import('probot').Probot} app
 */
module.exports = (app) => {
  app.on(['status'], async (context) => {
    const TFE_TOKEN = process.env.TFE_TOKEN;
    if (context.payload.state !== 'pending') {
      if (context.payload.description.includes('Run not triggered')) {
        app.log.info('There are no changes in this workspace');
        return null;
      }
      // Get repo data from repo full_name. e.g: gdurandvadas/tf-status
      const repository = context.payload.repository.full_name.split('/');

      // Get commit ID
      const commit = context.payload.commit.sha;

      // Build repo ref object with repository full_name data
      const repoRef = {
        owner: repository[0],
        repo: repository[1],
      };

      // Get Terraform workspace name and run ID from Terraform URL
      const terraformURL = context.payload.target_url.split('/');
      const workspaceName = terraformURL[5];
      const runID = terraformURL[7];

      // Find PR for this status
      // List all open Pull Requests
      const prs = await context.octokit.rest.pulls.list({
        state: 'open',
        ...repoRef,
      });

      // Find the PR matching this commit sha
      const pr = prs.data.filter((pr) => pr.head.sha === commit)[0];

      // If this status has a Pull Request
      if (pr) {
        // Build comment ref object
        const commentRef = {
          issue_number: pr.number,
          ...repoRef,
        };

        // Interact with Terraform Cloud API

        // Obtain run data
        const runData = await axios({
          method: 'get',
          url: `https://app.terraform.io/api/v2/runs/${runID}`,
          headers: {
            'Authorization': `Bearer ${TFE_TOKEN}`,
            'Content-Type': 'application/vnd.api+json',
          },
        });
        // Get Plan ID
        const planID = runData.data.data.relationships.plan.data.id;
        // Get Workspace ID
        const workspaceID = runData.data.data.relationships.workspace.data.id;

        // Obtain plan data
        // This requests generates an archive.terraform.io URL with the plan
        // This URL last for 60 seconds and then is removed by the Terraform API
        const planData = await axios({
          method: 'get',
          url: `https://app.terraform.io/api/v2/plans/${planID}`,
          headers: {
            'Authorization': `Bearer ${TFE_TOKEN}`,
            'Content-Type': 'application/vnd.api+json',
          },
        });
        // Get plan result archive URL
        const planResultArchiveURL =
          planData.data.data.attributes['log-read-url'];

        // Obtain the plan data from the archive URL
        const planResultData = await axios({
          method: 'get',
          url: planResultArchiveURL,
        });
        // Parse the plan (in ANSI)
        // This regex cleans all ANSI styles
        const planResult = planResultData.data.data.replace(
          /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
          '',
        );

        // Build PR comment body
        const commitMessage = context.payload.commit.commit.message;
        const planStatus = runData.data.data.attributes.status;
        const planIco = planStatus === 'planned_and_finished' ? '✅' : '⛔️';
        const body = `
## ${workspaceName}

- commit message:&nbsp;&nbsp; ${commitMessage.replace(/\n/g, ' ')}
- commit ref:&ensp;&ensp;&ensp;&ensp;&ensp;&ensp;&ensp; ${commit}
- workspace id:&ensp;&ensp;&ensp;&ensp;&ensp; \`${workspaceID}\`
- plan status:&ensp;&ensp;&ensp;&ensp; ${planIco} \`${planStatus.replace(
          /_/g,
          ' ',
        )}\`
- plan url:&ensp;&ensp;&ensp;&ensp;&ensp;&ensp;&ensp;&ensp;&ensp;&ensp;&ensp; [${workspaceName}/${runID}](${context.payload.target_url
          })
---
\`\`\`hcl
${planResult.replace('', '').replace(
            `
`,
            '',
          )}
\`\`\`
          `;

        // Check for the PR comments
        const comments = await context.octokit.rest.issues.listComments(
          commentRef,
        );
        // Search the comment matching the Workspace ID
        const botComment = comments.data.filter((c) =>
          c.body.includes(workspaceID),
        )[0];

        if (botComment) {
          // Update the comment if exists
          context.octokit.rest.issues.updateComment({
            ...repoRef,
            comment_id: botComment.id,
            body,
          });
        } else {
          // Create the comment
          context.octokit.rest.issues.createComment({
            ...commentRef,
            body,
          });
        }
      } else {
        app.log.info('This plan is not part of a pull request');
      }
    } else {
      app.log.info('Plan still pending... skipping');
    }
  });
};
