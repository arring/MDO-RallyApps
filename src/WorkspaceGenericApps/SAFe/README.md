# SAFe Apps README

## These SAFe apps require the following custom fields for your workspace:

	- c_MoSCoW on the lowest PortfolioItem (type: String)
	- c_TeamCommits on the lowest PortfolioItem, (type: Text)
	- c_Dependencies on HierarchicalRequirement, (type: Text)
	
	c_MoSCoW: (Undefined|Must Have|Should Have|Could Have|Won't Have)
	
	c_TeamCommits:
	{
		<ProjectObjectID>: {
			Commitment: (Undecided|N/A|Committed|Not Committed),
			Expected: boolean (default false),
			Objective: string (default ""),
			CEComment: string (default "")
		}
	}
	
	c_Dependencies:
	{ 
		Predecessors: {
			<DependencyID>: {
				Description: string
				NeededBy: date in number form
				Status: (Done|Not Done)
				PredecessorItems: {
					<PredecessorItemID>: {
						PredecessorUserStoryObjectID: number
						PredecessorProjectObjectID: number
						Supported: (Undefined|Yes|No)
						Assigned: boolean
					}
				)
			}
		},
		Successors: {
			<DependencyID>: {
				SuccessorUserStoryObjectID: number
				SuccessorProjectObjectID: number
				Description: string
				NeededBy: date in number form
				Supported: (Undefined|Yes|No)
				Assigned: boolean
			}
		}
	}
	
## Extra Instructions

	- These SAFe apps require that you enter in your trains and portfolios in the 'Scrum Group Portfolio Config' app before hand
	- Risks are stored as UserStories in a KeyValueDb project in the workspace. You need to set KeyValueDb in the Workspace
		Configuration app before using the SAFe apps.

	- You need to give everyone editor access to their portfolio projects and projects they have to depend on AND give everyone
		editor access to your KeyValueDb storage project.

## Long Term TODOs

	- create teamCommits and Dependencies models for enhanced validation through a single file.
	- move Dependencies into UserStories in the KeyValueDb project (similar to risks)
	- get rid of intel-safe-models.js file since we are moving every model into their own files