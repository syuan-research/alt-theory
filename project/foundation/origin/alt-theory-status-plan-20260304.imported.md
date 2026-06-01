
### Project Background

Alt Theory is an AI cognitive mentor for environmental psychology theoretical learning and innovation. Current v0.4 includes:

- An general theoretical understanding agent and a theoretical innovation agent
	- Three thinking patterns: inductive, deductive, epistemology-aware
- RAG knowledge base with parent-child slice
- Workflow prototype

![](attachment/abb766401f296e212c9487e9e352748c.png)

Also See: 
- [why_developed_this_system.md](why_developed_this_system.md)
- [IAPS_conference_abstract.md](IAPS_conference_abstract.md)
- [Alt Theory v0.4 (Dify) Description.md](<Alt Theory v0.4 (Dify) Description.md>)


### Current Status (What Have Been Done?)

**Actual work**
- Created a workflow based prototype
- Improved the prototype by manually testing

**Ideas and planning**
- Identified a series of minor usability issues
- Have a rough idea on future expansion on knowledge base and way of thinking expansion
- Have a plan on agentic framework testing
- Have a rough plan on a half-automatic eval sys
- Have a timeline with the short-term phases being clearer
- Have an eval framework that can be adopted into a eval for the earliest phase

**Feel uncertain on**
- How to “crazily" identify good needs, uses, and issues in earlier stages (before we make the developing more completed or inviting people to formally test and eval it)
- What may be some successful experiences in other chat-based agent systems in AI4SS/ for education that we can learn from?
- What are some papers on similar agent systems in AI4SS/ for education that we can learn from?
- What are some critical challenges and bottlenecks we can envision in advance?
- Any fundamental angles of view in this project that I might have missed? (for example, how people would respond to it? how to understand this sys compare with similar ones? )
- Collaboration and community engagement. 
	- who may be core members?
	- who may not be a core member but will offer connection, credibility, critical knowledge/views, visibility to the proj?
	- how to engage early users to test in (on at platform, whether wechat group or github or somewhere else)
	- how to identify and recruit those "experts" that are needed for the eval? 

### Key Decisions Made

**Agentic Framework testing and choice**
- Tentatively setting claude code-like (file sys + command line + skill as agent and features + md as memory and sub-agent) as the primary choice, this include:
	- Tentatively setting claude agent SDK as the fundamental framework, thereby, prototypes can be in the form of claude code + proj folder (as the low-level spec is exactly the same)
	- rapid iterations (develop+eval+modify) can be implemented in the same folder/sys, with diff skills and sub-agents implementing those skills (alt theory, simulated users, llm-as-a-judge)
- Setting traditional ReAct agentic loop + RAG as alternative choice
- Architecture/framework choice (Skill vs React) deferred to post-April

**Sys architecture current-plan (claude code)**
- Main agent as the "co-researcher" of the research team
- Alt-theory, Sim Users, LLM judges as skills or config+prompt; `sub agent` or `agent team` will be used
- Sim User test: using `agent team` to handle inter-agent messaging between alt theory and sim users
- Human User test: using `agent team` to make dialogue with the alt theory agent
- LLM-judge: using `sub agent` with a skill to evaluate a conversation history stored in files
- Still need a logic to improve the system based on these simulations

![](attachment/7125945d2dbc0ce5c04aa474061d0c88.png)

**Knowledge base (KB) data pipeline, tech spec, and Retrieval Eval (coarse)**

- Open question: vector-embedding vs file system + cli commands (ls, grep, etc)
- Need experiment to compare both approaches

- Setting experimental factors
	- file para:, e.g., composition of theories in md, whether to include examples,  detailedness of content, filename components, etc 
	- sys para: 
		- multiple sub agent retrieval in parallel possible? 
		- external KB use possible? 
		- yaml head use/any other label sys possible?  
		- something similar to parent-child retrieval possible?
		- better query rewrite prompt (in skill)
- setting retrieval performence metrics
- Setting up a experimental sys, main agent as co-researcher, retrieval agent being a sub agent
- Open question: end crit? when to say"okay this is enough and let's keep it"?
	- after a certain num of rounds?
	- after testing a certain number of factors?
	- after a few metrics are satisfying?
	- after none of the metrics saying "unacceptable"?
	- after most of us feel "this is good enough"?
	- after we feel "we have to move on to the other parts of the work"?
	- after we complete some procedure similar to other studies? 

**GitHub Workflow**
- Starting April, uploading it to github so it will be more ready for long-distance colab
- Small fixes (typos, docs) can be direct push
- PR serves as a pause point for review

**Eval Plan**
- not too much decided for the phase 1-A, only a initial eval framework
- 
![](attachment/edd9b809d05ff5531823116395240022.png)
### Future Plan

**Phase 1: 
MVP Refinement + First Formal Eval + First Presentation (Now - Mid-May - June)**

1-A
- Identify as much as issues and future ideas as possible
- Develop a system in either claude-code-like framework or classic ReAct
- Basic eval metrics for conference presentation
- A few rounds of in-house "vibe eval" and sim user eval done
- A prototype with general good response speed and compliance with the procedure is developed

1-B
- One round  formal user testing done
- Multiple rounds simulation eval done
- Start to build a community of early users
- Conference presentation early June at IAPS 2026 in UK (the top conf of env psych)
- Attract more experts, collaborators, and users there

**Phase 2: Transition to a more decent product/tool + Papers of phase 1 work (July-December)** 

2-A Transition to the new phase (July - September, very tentative)
- Decide: Claude Code-like (file + cli) vs ReAct
- Decide: Embedding vs Terminal commands + md
- Setting up our platforms (git-hub, wechat, whatsapp/discord)
- Setting up the expanded team and community
- Setting up a modular system to expand on way of thinking and knowledge base (simply speaking, skill and limited hard coded features)
- Address previous feedback
- Submit a paper on phase 1 results

2-B Co-creation + phase 2 eval + expanding scope (Oct-Dec, very tentative)
- Continually improve the sys based on users and new experts feedback
- Evaluate the new system with more data and improved evaluation plan
- Expanding the sys to more env-related disciplines


