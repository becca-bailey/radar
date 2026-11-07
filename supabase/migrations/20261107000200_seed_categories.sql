-- Fixed category taxonomy (PLAN.md §4). Descriptions are what gets embedded;
-- a one-off job fills the embedding column. Slugs are stable identifiers —
-- never renumber or reuse.

insert into public.categories (slug, name, description) values
  ('technology', 'Technology', 'Software, hardware, programming, the tech industry, and how technical systems are built and maintained.'),
  ('ai', 'AI', 'Artificial intelligence, machine learning, language models, and their capabilities, limits, and consequences.'),
  ('internet-culture', 'Internet culture', 'Online communities, platforms, memes, creator economies, and how life on the internet works.'),
  ('science', 'Science', 'Research findings and explanations across physics, chemistry, biology, astronomy, and the practice of science itself.'),
  ('health-medicine', 'Health & medicine', 'Medicine, public health, disease, treatment, nutrition, fitness, and the healthcare system.'),
  ('psychology', 'Psychology', 'How minds work: cognition, behavior, mental health, relationships, and human development.'),
  ('climate-environment', 'Climate & environment', 'Climate change, energy, conservation, pollution, and the natural systems humans depend on.'),
  ('nature-outdoors', 'Nature & outdoors', 'Wildlife, plants, landscapes, hiking, gardening, and time spent outside.'),
  ('economics', 'Economics', 'How economies work: markets, trade, labor, inequality, economic research and commentary.'),
  ('business-work', 'Business & work', 'Companies, industries, management, careers, workplaces, and the changing nature of work.'),
  ('politics-policy', 'Politics & policy', 'Government, elections, legislation, courts, political movements, and public policy debates.'),
  ('current-affairs', 'Current affairs', 'Reported news and analysis of events happening in the world right now.'),
  ('history', 'History', 'The past: events, people, places, and how we came to be where we are.'),
  ('essays-ideas', 'Essays & ideas', 'Philosophy, argument, and reflective essays about how to think and how to live.'),
  ('books-literature', 'Books & literature', 'Books, authors, reviews, criticism, publishing, and the literary world.'),
  ('fiction', 'Fiction', 'Short stories, serialized fiction, poetry, and other creative writing published online.'),
  ('culture-media', 'Culture & media', 'Journalism, media criticism, celebrity, fandom, and commentary on the cultural moment.'),
  ('film-tv', 'Film & TV', 'Movies, television, streaming, reviews, and the people who make screen entertainment.'),
  ('music', 'Music', 'Musicians, albums, scenes, music history, and writing about listening.'),
  ('art-design', 'Art & design', 'Visual art, graphic design, photography, architecture criticism, and aesthetics.'),
  ('craft-making', 'Craft & making', 'Knitting, sewing, woodworking, DIY, and the culture and technique of making things by hand.'),
  ('food-cooking', 'Food & cooking', 'Recipes, restaurants, food writing, cooking technique, and food culture.'),
  ('travel-places', 'Travel & places', 'Travel writing, cities, geography, and the character of particular places.'),
  ('urbanism-housing', 'Urbanism & housing', 'Cities, housing, transit, zoning, and how the built environment shapes daily life.'),
  ('sports-games', 'Sports & games', 'Athletics, competition, board games, video games, and play.'),
  ('education-learning', 'Education & learning', 'Schools, teaching, universities, self-education, and how people learn.'),
  ('data-statistics', 'Data & statistics', 'Data analysis, statistics, charts, quantitative research methods, and data-driven storytelling.'),
  ('humor', 'Humor', 'Comedy, satire, and things that are mainly here to be funny.');
