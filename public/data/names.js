// Shared person-name bank. Every generated person in the game (customers, prospects, candidates, investors,
// advisors, network contacts, reporters, creators, interviewees, co-founder candidates...) draws from here through
// core/names.js personName(), which also keeps full names unique within one game.
//
// Pools are cultural/linguistic groups of common given names and surnames, so a drawn name is coherent
// ("Wanjiru Kariuki", "Mateo Salazar", "Haruka Ishikawa") instead of a random mix. Regions are weighted mixes of
// pools; the weights are rough [design] choices for "people a 2026 SaaS founder meets", not statistics.
// Names are flavour only: nothing about a person (skill, honesty, English level) is ever derived from the name.
// Fictional only: no pool pairs a famous founder's, investor's or celebrity's given name with their surname on
// purpose, and BLOCKED catches the combinations the draw could still produce.

export const POOLS = {
  us: {
    first: ['Michael', 'Jennifer', 'Christopher', 'Jessica', 'Matthew', 'Ashley', 'Joshua', 'Amanda', 'Andrew', 'Brittany', 'Ryan', 'Megan', 'Tyler', 'Lauren', 'Brandon', 'Rachel', 'Justin', 'Kayla', 'Kevin', 'Heather', 'Jason', 'Nicole', 'Eric', 'Stephanie', 'Kyle', 'Danielle', 'Austin', 'Courtney', 'Derek', 'Alyssa', 'Travis', 'Samantha', 'Marcus', 'Shannon', 'Jamal', 'Tiffany', 'Malik', 'Keisha', 'DeShawn', 'Aaliyah', 'Darnell', 'Imani', 'Terrence', 'Jasmine', 'Cody', 'Brooke', 'Logan', 'Madison', 'Caleb', 'Hailey', 'Garrett', 'Whitney', 'Trevor', 'Erin', 'Grant', 'Molly', 'Wesley', 'Paige', 'Colby', 'Kendra', 'Dustin', 'Leah', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Jamie', 'Quinn', 'Parker', 'Reese', 'Hayden', 'Dana', 'Elliot', 'Rowan', 'Drew', 'Kelsey', 'Chad', 'Mallory', 'Sean', 'Allison', 'Nathan', 'Melissa', 'Bradley', 'Kristen', 'Aaron', 'Lindsay', 'Spencer', 'Natalie'],
    last: ['Miller', 'Brooks', 'Reed', 'Hughes', 'Price', 'Bennett', 'Foster', 'Ward', 'Sullivan', 'Hayes', 'Bailey', 'Carter', 'Mitchell', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Morris', 'Rogers', 'Cook', 'Morgan', 'Bell', 'Murphy', 'Cooper', 'Richardson', 'Cox', 'Howard', 'Peterson', 'Gray', 'Ramsey', 'Watson', 'Jenkins', 'Perry', 'Powell', 'Long', 'Patterson', 'Washington', 'Butler', 'Simmons', 'Barnes', 'Henderson', 'Coleman', 'Jordan', 'Graham', 'Wallace', 'Dixon', 'Holmes', 'Freeman', 'Wells', 'Hale', 'Whitaker', 'Caldwell', 'Fletcher', 'Lawson', 'Harmon', 'Pruitt', 'Gentry', 'Holloway', 'Sutton', 'Kerr', 'Mercer', 'Dalton', 'Langley', 'Burke', 'McAllister', 'Doyle', 'Schultz', 'Kowalczyk', 'Lindgren', 'Abbott', 'Everhart', 'Hartwell', 'Underhill', 'Calloway', 'Faulkner', 'Whitlock', 'Gallagher', 'Brennan', 'Quinlan', 'Sorensen', 'Achterberg', 'Haskins', 'Merritt', 'Pickett', 'Stanton', 'Vaughn', 'Weston', 'Yates', 'Booker', 'Ellison', 'Garner', 'Maddox', 'Odom', 'Rhodes', 'Tatum', 'Whitfield'],
  },
  canada_en: {
    first: ['Liam', 'Emma', 'Owen', 'Brooke', 'Connor', 'Avery', 'Declan', 'Mackenzie', 'Aiden', 'Isla', 'Carter', 'Hannah', 'Logan', 'Zoe', 'Nolan', 'Brynn', 'Callum', 'Tessa', 'Graham', 'Rory', 'Kiera', 'Jasper', 'Sloane', 'Bennett', 'Maren', 'Cole', 'Sienna', 'Reid', 'Delaney', 'Ethan', 'Olivia', 'Noah'],
    last: ['MacDonald', 'Campbell', 'Fraser', 'MacKenzie', 'McLeod', 'Robertson', 'Thompson', 'Wilson', 'Anderson', 'MacNeil', 'Chisholm', 'MacLean', 'Henderson', 'Ross', 'Murray', 'Sinclair', 'Gillis', 'MacIsaac', 'Morrison', 'Cameron', 'Ferguson', 'Grant', 'Reid', 'Hamilton', 'Kerr', 'Doucette', 'Mackay', 'Bannerman', 'Boyd', 'Duncan'],
  },
  quebec: {
    first: ['Mathieu', 'Chloé', 'Amélie', 'Gabriel', 'Léa', 'Félix', 'Camille', 'Olivier', 'Rosalie', 'Justine', 'Alexandre', 'Maude', 'Étienne', 'Marie-Ève', 'Jean-Philippe', 'Simon', 'Évelyne', 'Rémi', 'Noémie', 'Xavier', 'Frédérique', 'Samuel', 'Laurence', 'Vincent', 'Geneviève', 'Antoine', 'Sophie', 'Mathilde'],
    last: ['Tremblay', 'Roy', 'Gagnon', 'Bouchard', 'Côté', 'Gauthier', 'Morin', 'Lavoie', 'Fortin', 'Gagné', 'Ouellet', 'Pelletier', 'Bélanger', 'Lévesque', 'Bergeron', 'Leblanc', 'Paquette', 'Simard', 'Boucher', 'Caron', 'Beaulieu', 'Cloutier', 'Dubé', 'Poirier', 'Lapointe', 'Arsenault', 'Thibodeau', 'Desjardins', 'Lachance', 'Bissonnette'],
  },
  latam_es: {
    first: ['Camila', 'Mateo', 'Valentina', 'Santiago', 'Lucía', 'Sebastián', 'Joaquín', 'Mariana', 'Sofía', 'Diego', 'Gabriela', 'Alejandro', 'Daniela', 'Andrés', 'Paula', 'Felipe', 'Catalina', 'Nicolás', 'Ximena', 'Emiliano', 'Renata', 'Rodrigo', 'Florencia', 'Tomás', 'Agustina', 'Matías', 'Fernanda', 'Javier', 'Luciana', 'Gonzalo', 'Antonella', 'Ricardo', 'Martín', 'Guadalupe', 'Iván', 'Jimena', 'Hernán', 'Marisol', 'Esteban', 'Octavio', 'Valeria', 'Facundo', 'Abril', 'Ignacio', 'Luis', 'Carlos', 'Rosa', 'Elena'],
    last: ['González', 'Rodríguez', 'Fernández', 'Martínez', 'Ramírez', 'Castro', 'Rojas', 'López', 'Hernández', 'Morales', 'Vargas', 'Herrera', 'Medina', 'Aguilar', 'Mendoza', 'Guzmán', 'Ríos', 'Navarro', 'Salazar', 'Cabrera', 'Figueroa', 'Paredes', 'Benítez', 'Acosta', 'Sandoval', 'Ochoa', 'Valdez', 'Quintero', 'Zapata', 'Arriaga', 'Villalobos', 'Echeverría', 'Bustamante', 'Montoya', 'Peralta', 'Cordero', 'Lozano', 'Fuentes', 'Domínguez', 'Cárdenas', 'Ortega', 'Gallardo', 'Sepúlveda', 'Mejía', 'Carrasco', 'Espinoza', 'Reyes', 'Ortiz', 'Delgado', 'Ibarra', 'Castillo', 'Zamora'],
  },
  brazil: {
    first: ['Isabela', 'Thiago', 'João', 'Pedro', 'Bruna', 'Caio', 'Manuela', 'Leonardo', 'Carolina', 'Letícia', 'Rafael', 'Larissa', 'Gustavo', 'Beatriz', 'Eduardo', 'Juliana', 'Vitória', 'Bernardo', 'Thaís', 'Lucas', 'Heloísa', 'Marcelo', 'Luana', 'Vinícius', 'Renato', 'Aline', 'Otávio', 'Priscila', 'Felipe', 'Fernanda'],
    last: ['Silva', 'Souza', 'Pereira', 'Carvalho', 'Oliveira', 'Santos', 'Almeida', 'Barbosa', 'Ribeiro', 'Rocha', 'Moreira', 'Cardoso', 'Teixeira', 'Nascimento', 'Araújo', 'Correia', 'Monteiro', 'Campos', 'Vieira', 'Pacheco', 'Lima', 'Gomes', 'Costa', 'Martins', 'Mendes', 'Freitas', 'Dias', 'Nogueira', 'Azevedo', 'Cavalcanti', 'Batista'],
  },
  uk_ie: {
    first: ['Oliver', 'Amelia', 'Harriet', 'George', 'Imogen', 'Rhys', 'Ffion', 'Callum', 'Isla', 'Fraser', 'Eilidh', 'Niamh', 'Ciarán', 'Siobhán', 'Aoife', 'Seán', 'Declan', 'Orla', 'Cormac', 'Saoirse', 'Alfie', 'Poppy', 'Archie', 'Freya', 'Rory', 'Phoebe', 'Hamish', 'Bethan', 'Ewan', 'Gemma', 'Toby', 'Lucy', 'Jack', 'Sophie', 'Ollie', 'Charlotte', 'Dylan', 'Megan', 'Theo', 'Martha', 'Ben', 'Ruth', 'Tom', 'Grace'],
    last: ['Taylor', 'Murphy', 'Evans', 'Walsh', "O'Brien", 'Byrne', 'Kelly', 'Doherty', 'Wright', 'Clarke', 'Robinson', 'Hall', 'Thornton', 'Ashworth', 'MacLeod', 'Davies', 'Jones', 'Williams', 'Thomas', 'Roberts', 'Lewis', 'Green', 'Wood', 'Harrison', 'Barker', 'Pemberton', 'Fitzgerald', 'Gallagher', 'Quinn', 'Brennan', 'Kavanagh', 'McCarthy', 'Sheridan', 'Nolan', 'Burns', 'Watt', 'Crawford', 'Ellis', 'Holt', 'Kemp', 'Rowe', 'Carver', 'Ferris', 'Hale', 'Cole', 'Fontaine'],
  },
  france: {
    first: ['Louis', 'Manon', 'Hugo', 'Théo', 'Juliette', 'Antoine', 'Élodie', 'Benoît', 'Margaux', 'Clément', 'Pauline', 'Julien', 'Inès', 'Maxime', 'Anaïs', 'Romain', 'Céline', 'Guillaume', 'Aurélie', 'Baptiste', 'Mathilde', 'Nicolas', 'Océane', 'Quentin', 'Elsa', 'Arthur', 'Camille', 'Bastien', 'Pierre', 'Claire'],
    last: ['Dubois', 'Lefebvre', 'Moreau', 'Laurent', 'Simon', 'Michel', 'Leroy', 'Roux', 'Fontaine', 'Girard', 'Bernard', 'Petit', 'Durand', 'Lambert', 'Bonnet', 'François', 'Mercier', 'Blanc', 'Guérin', 'Chevalier', 'Garnier', 'Faure', 'Rousseau', 'Fournier', 'Morel', 'Perrin', 'Marchand', 'Dumont', 'Lemaire', 'Renaud', 'Barbier', 'Picard', 'Duval', 'Martin'],
  },
  germanic: {
    first: ['Maximilian', 'Lena', 'Finn', 'Hannah', 'Jonas', 'Leonie', 'Felix', 'Mila', 'Tobias', 'Annika', 'Matthias', 'Greta', 'Lukas', 'Clara', 'Paul', 'Johanna', 'Niklas', 'Lea', 'Florian', 'Katharina', 'Moritz', 'Jannik', 'Franziska', 'Elias', 'Theresa', 'Benedikt', 'Svenja', 'Stefan', 'Anja', 'Henrik', 'Julia', 'Leon'],
    last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Hoffmann', 'Schäfer', 'Koch', 'Richter', 'Bauer', 'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hofmann', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Köhler', 'Huber', 'Gruber', 'Brunner', 'Keller', 'Vogt', 'Brandt', 'Kessler', 'Seidel', 'Adler'],
  },
  dutch_be: {
    first: ['Jan', 'Sanne', 'Thijs', 'Femke', 'Daan', 'Lotte', 'Bram', 'Pieter', 'Sem', 'Fleur', 'Ruben', 'Anouk', 'Joris', 'Eva', 'Maarten', 'Noor', 'Wouter', 'Ilse', 'Stijn', 'Lieke', 'Jasper', 'Marloes', 'Sander', 'Esther'],
    last: ['Jansen', 'de Vries', 'Bakker', 'Visser', 'Smit', 'Meijer', 'de Boer', 'Mulder', 'Bos', 'Vos', 'Peeters', 'Janssens', 'Maes', 'de Jong', 'van Dijk', 'van den Berg', 'Hendriks', 'Dekker', 'Brouwer', 'Willems', 'Claes', 'Verhoeven', 'Kuipers', 'van Leeuwen', 'Mertens', 'Jacobs'],
  },
  nordic: {
    first: ['Lars', 'Ingrid', 'Erik', 'Astrid', 'Mikkel', 'Freja', 'Oskar', 'Elin', 'Sofie', 'Sven', 'Nils', 'Maja', 'Henrik', 'Sigrid', 'Anders', 'Liv', 'Magnus', 'Ebba', 'Rasmus', 'Ida', 'Johan', 'Saga', 'Emil', 'Linnea', 'Aksel', 'Hanna'],
    last: ['Andersen', 'Nielsen', 'Hansen', 'Johansson', 'Lindqvist', 'Eriksson', 'Larsen', 'Berg', 'Nyström', 'Virtanen', 'Korhonen', 'Karlsson', 'Nilsson', 'Lindgren', 'Holm', 'Dahl', 'Halvorsen', 'Sørensen', 'Christensen', 'Pedersen', 'Bergström', 'Sandberg', 'Lund', 'Mäkinen', 'Nieminen', 'Haugen', 'Eriksen', 'Lind'],
  },
  italy: {
    first: ['Matteo', 'Giulia', 'Lorenzo', 'Chiara', 'Alessandro', 'Francesca', 'Davide', 'Martina', 'Federico', 'Elisa', 'Riccardo', 'Giorgio', 'Valentina', 'Andrea', 'Silvia', 'Marco', 'Alessia', 'Simone', 'Ilaria', 'Tommaso', 'Beatrice', 'Pietro', 'Serena', 'Lucia'],
    last: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Conti', 'De Luca', 'Bruno', 'Gallo', 'Costa', 'Fontana', 'Moretti', 'Barbieri', 'Lombardi', 'Giordano', 'Rinaldi', 'Caruso', 'Ferraro', 'Galli', 'Martini', 'Leone', 'Longo', 'Mancini'],
  },
  iberia: {
    first: ['Pablo', 'Álvaro', 'Carmen', 'Marta', 'Lucía', 'Diogo', 'Beatriz', 'Tiago', 'Rui', 'Inês', 'Hugo', 'Sergio', 'Nerea', 'Iker', 'Ainhoa', 'Jorge', 'Elena', 'Raúl', 'Irene', 'Adrián', 'Alba', 'Gonçalo', 'Mafalda', 'Duarte', 'Leonor', 'Afonso', 'Ana'],
    last: ['García', 'Sánchez', 'Pérez', 'Gómez', 'Ruiz', 'Jiménez', 'Moreno', 'Álvarez', 'Muñoz', 'Iglesias', 'Romero', 'Torres', 'Vázquez', 'Serrano', 'Blanco', 'Molina', 'Rubio', 'Marín', 'Ferreira', 'Sousa', 'Lopes', 'Fernandes', 'Gonçalves', 'Rodrigues', 'Marques', 'Pinto', 'Duarte', 'Castro'],
  },
  poland: {
    first: ['Katarzyna', 'Tomasz', 'Piotr', 'Agnieszka', 'Jakub', 'Zofia', 'Kamil', 'Wiktoria', 'Szymon', 'Marek', 'Magdalena', 'Paweł', 'Joanna', 'Krzysztof', 'Aleksandra', 'Michał', 'Natalia', 'Łukasz', 'Monika', 'Bartosz', 'Karolina', 'Wojciech'],
    last: ['Kowalski', 'Nowak', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak', 'Kozłowski', 'Jankowski', 'Mazur', 'Krawczyk', 'Kaczmarek', 'Piotrowski', 'Grabowski', 'Pawlak', 'Michalski', 'Zając', 'Król', 'Wieczorek', 'Jabłoński', 'Wróbel', 'Dudek'],
  },
  czech_slovak: {
    first: ['Ondřej', 'Tereza', 'Lukáš', 'Klára', 'Petra', 'Matej', 'Lenka', 'Barbora', 'Tomáš', 'Eliška', 'Vojtěch', 'Zuzana', 'Filip', 'Adéla', 'Jiří', 'Martin'],
    last: ['Novák', 'Dvořák', 'Svoboda', 'Novotný', 'Procházka', 'Černý', 'Veselý', 'Horák', 'Němec', 'Pospíšil', 'Hájek', 'Král', 'Kučera', 'Beneš', 'Krejčí', 'Kováč', 'Urban', 'Blažek'],
  },
  ukraine: {
    first: ['Andrii', 'Oksana', 'Dmytro', 'Olena', 'Yaroslav', 'Svitlana', 'Taras', 'Nadiya', 'Bohdan', 'Iryna', 'Oleksandr', 'Kateryna', 'Mykola', 'Yulia', 'Serhii', 'Tetiana', 'Vitalii', 'Halyna', 'Maksym', 'Anastasiia'],
    last: ['Shevchenko', 'Bondarenko', 'Kovalenko', 'Tkachenko', 'Melnyk', 'Kravchenko', 'Oliinyk', 'Boyko', 'Kovalchuk', 'Polishchuk', 'Lysenko', 'Savchenko', 'Rudenko', 'Moroz', 'Marchenko', 'Petrenko', 'Klymenko', 'Pavlenko', 'Hrytsenko', 'Ponomarenko'],
  },
  romania: {
    first: ['Mihai', 'Ana', 'Andrei', 'Ioana', 'Alexandru', 'Vlad', 'Irina', 'Radu', 'Bianca', 'Cristina', 'Ștefan', 'Elena', 'Adrian', 'Raluca', 'Sorin', 'Diana', 'Bogdan'],
    last: ['Popescu', 'Ionescu', 'Constantin', 'Stan', 'Dumitru', 'Marin', 'Popa', 'Stoica', 'Gheorghe', 'Munteanu', 'Matei', 'Ciobanu', 'Rusu', 'Diaconu', 'Moldovan', 'Barbu', 'Toma', 'Nistor'],
  },
  balkans: {
    first: ['Nikola', 'Milica', 'Stefan', 'Jelena', 'Luka', 'Maja', 'Dragan', 'Ivana', 'Marko', 'Petar', 'Tamara', 'Sanja', 'Bojan', 'Katarina', 'Damir', 'Mirela', 'Georgi', 'Desislava'],
    last: ['Horvat', 'Kovač', 'Jovanović', 'Petrović', 'Nikolić', 'Marković', 'Đorđević', 'Babić', 'Ilić', 'Stojanović', 'Pavlović', 'Knežević', 'Marić', 'Jurić', 'Popović', 'Kovačević', 'Tomić', 'Vuković', 'Perić', 'Georgiev', 'Dimitrov', 'Petrov'],
  },
  hungary: {
    first: ['Gergely', 'Eszter', 'Bence', 'Réka', 'Zoltán', 'Anikó', 'Dániel', 'Katalin', 'Levente', 'Zsófia', 'Ádám', 'Noémi'],
    last: ['Horváth', 'Nagy', 'Tóth', 'Szabó', 'Kovács', 'Varga', 'Molnár', 'Németh', 'Farkas', 'Balogh', 'Papp', 'Takács', 'Juhász', 'Lakatos'],
  },
  baltics: {
    first: ['Artūrs', 'Līga', 'Mindaugas', 'Rūta', 'Kristjan', 'Kadri', 'Jānis', 'Ieva', 'Tomas', 'Kaspars', 'Laura', 'Mart'],
    last: ['Kalniņš', 'Ozols', 'Kazlauskas', 'Tamm', 'Saar', 'Jankauskas', 'Bērziņš', 'Petrauskas', 'Sepp', 'Kask', 'Liepa', 'Vaitkus'],
  },
  nigeria: {
    first: ['Chidi', 'Tunde', 'Ngozi', 'Emeka', 'Chiamaka', 'Oluwaseun', 'Funmilayo', 'Babajide', 'Adaeze', 'Ifeanyi', 'Yetunde', 'Obinna', 'Uchenna', 'Amaka', 'Segun', 'Folake', 'Chinedu', 'Nkechi', 'Damilola', 'Kelechi', 'Temitope', 'Ikenna', 'Bukola', 'Olumide', 'Zainab', 'Hauwa', 'Amara', 'Tobi'],
    last: ['Okafor', 'Adeyemi', 'Balogun', 'Nwosu', 'Okonkwo', 'Eze', 'Obi', 'Adebayo', 'Ogunleye', 'Oyelaran', 'Afolabi', 'Chukwu', 'Nnamdi', 'Okeke', 'Ibe', 'Okoro', 'Olawale', 'Bello', 'Abubakar', 'Danjuma', 'Ogunbiyi', 'Akinola', 'Uzor', 'Onyekachi', 'Nwachukwu', 'Ezeh', 'Adeleke', 'Oyewole', 'Mbah'],
  },
  ghana: {
    first: ['Kofi', 'Kwame', 'Ama', 'Kwabena', 'Akosua', 'Yaw', 'Efua', 'Kojo', 'Abena', 'Esi', 'Kwesi', 'Adwoa', 'Nana', 'Yaa'],
    last: ['Mensah', 'Osei', 'Owusu', 'Boateng', 'Asante', 'Agyeman', 'Appiah', 'Darko', 'Ofori', 'Amoah', 'Quaye', 'Addo', 'Tetteh', 'Ansah'],
  },
  east_africa: {
    first: ['Wanjiru', 'Kamau', 'Wanjiku', 'Achieng', 'Njeri', 'Baraka', 'Zawadi', 'Juma', 'Neema', 'Wairimu', 'Muthoni', 'Akinyi', 'Amani', 'Halima', 'Rehema', 'Nyambura', 'Kibet', 'Atieno', 'Mumbua', 'Imani', 'Furaha', 'Jabari'],
    last: ['Mwangi', 'Otieno', 'Kimani', 'Kariuki', 'Njoroge', 'Wambui', 'Ochieng', 'Odhiambo', 'Kiprop', 'Chebet', 'Mutua', 'Wanyama', 'Onyango', 'Nyaga', 'Kiplagat', 'Macharia', 'Waweru', 'Owino', 'Mugo', 'Mbugua', 'Ssempala', 'Nakato', 'Kamau', 'Achieng'],
  },
  south_africa: {
    first: ['Thabo', 'Lerato', 'Sipho', 'Naledi', 'Themba', 'Nomvula', 'Lwazi', 'Zanele', 'Mandla', 'Ayanda', 'Tendai', 'Rutendo', 'Tatenda', 'Chipo', 'Kagiso', 'Palesa', 'Bongani', 'Thandeka'],
    last: ['Ndlovu', 'Dlamini', 'Nkosi', 'Mokoena', 'Khumalo', 'Mahlangu', 'Molefe', 'Moyo', 'Mutasa', 'Chikwanha', 'Sithole', 'Mthembu', 'Ngcobo', 'Mabaso', 'Nkomo', 'Banda', 'Phiri', 'Zungu'],
  },
  ethiopia: {
    first: ['Abebe', 'Selam', 'Dawit', 'Hiwot', 'Yonas', 'Meron', 'Tigist', 'Bereket', 'Liya', 'Henok'],
    last: ['Tesfaye', 'Bekele', 'Haile', 'Girma', 'Alemu', 'Getachew', 'Mekonnen', 'Tadesse', 'Wolde', 'Assefa'],
  },
  west_africa_fr: {
    first: ['Moussa', 'Aminata', 'Ousmane', 'Fatou', 'Mamadou', 'Awa', 'Ibrahima', 'Mariama', 'Cheikh', 'Aïssatou', 'Seydou', 'Kadiatou', 'Abdoulaye', 'Ramatoulaye'],
    last: ['Diallo', 'Traoré', 'Ndiaye', 'Sow', 'Coulibaly', 'Keita', 'Diop', 'Fofana', 'Kamara', 'Camara', 'Cissé', 'Konaté', 'Sylla', 'Ba'],
  },
  arab: {
    first: ['Omar', 'Layla', 'Youssef', 'Mariam', 'Karim', 'Yasmin', 'Rami', 'Leila', 'Tariq', 'Hala', 'Samir', 'Rania', 'Khalid', 'Noor', 'Faisal', 'Dina', 'Hassan', 'Salma', 'Ziad', 'Lina', 'Amira', 'Walid', 'Farah', 'Majid', 'Reem', 'Nabil', 'Hiba', 'Fadi', 'Adel', 'Mona', 'Hamza', 'Dalia', 'Tamer', 'Imad', 'Ghada', 'Bassam', 'Lama', 'Mehdi', 'Nadia', 'Sami', 'Yara', 'Ayman', 'Malak', 'Idris'],
    last: ['Haddad', 'Khoury', 'Mansour', 'Nasser', 'Saleh', 'Hamdan', 'Aziz', 'Darwish', 'Habib', 'Barakat', 'Farouk', 'Abdel-Malek', 'El-Sayed', 'Hassan', 'Ibrahim', 'Mahmoud', 'Mustafa', 'Said', 'Youssef', 'Karam', 'Najjar', 'Sabbagh', 'Tannous', 'Kassab', 'Shams', 'Al-Amin', 'Al-Rashid', 'Al-Masri', 'Al-Farsi', 'Qasim', 'Jaber', 'Suleiman', 'Zaher', 'Bitar', 'Ghanem', 'Maalouf', 'Sfeir', 'Fawzi', 'Shalaby', 'Bennani', 'Alaoui', 'Benjelloun', 'Haddadi', 'Abdel'],
  },
  iran: {
    first: ['Reza', 'Shirin', 'Darius', 'Parisa', 'Arash', 'Neda', 'Kian', 'Sina', 'Mahsa', 'Babak', 'Roya', 'Omid', 'Yasaman', 'Farah'],
    last: ['Karimi', 'Hosseini', 'Rostami', 'Tehrani', 'Moradi', 'Ahmadi', 'Jafari', 'Sadeghi', 'Rahimi', 'Mohammadi', 'Kazemi', 'Ebrahimi', 'Farahani', 'Navabi'],
  },
  turkey: {
    first: ['Emre', 'Elif', 'Burak', 'Zeynep', 'Mert', 'Ayşe', 'Can', 'Defne', 'Selin', 'Kerem', 'Ece', 'Oğuz', 'Deniz', 'Cem', 'Ebru', 'Barış'],
    last: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Öztürk', 'Arslan', 'Doğan', 'Yıldız', 'Koç', 'Kurt', 'Özdemir', 'Aksoy', 'Polat', 'Erdem'],
  },
  israel: {
    first: ['Noa', 'Eitan', 'Tamar', 'Yael', 'Itai', 'Omer', 'Shira', 'Yonatan', 'Maya', 'Ido', 'Noam', 'Liat', 'Avi', 'Hila', 'Uri', 'Talia'],
    last: ['Cohen', 'Levi', 'Mizrahi', 'Friedman', 'Peretz', 'Ben-David', 'Shapiro', 'Katz', 'Avraham', 'Biton', 'Dahan', 'Goldberg', 'Rosenberg', 'Weiss', 'Halevi', 'Ashkenazi'],
  },
  india_north: {
    first: ['Aarav', 'Ananya', 'Rohan', 'Priya', 'Vikram', 'Diya', 'Aditya', 'Kavya', 'Rahul', 'Pooja', 'Siddharth', 'Ishita', 'Nikhil', 'Neha', 'Varun', 'Shreya', 'Anjali', 'Abhishek', 'Swati', 'Manish', 'Gaurav', 'Akash', 'Kunal', 'Amit', 'Sanya', 'Rajiv', 'Tanvi', 'Ritu', 'Harjit', 'Navdeep', 'Simran', 'Gurpreet', 'Dev', 'Isha', 'Raj', 'Sameer'],
    last: ['Sharma', 'Gupta', 'Kulkarni', 'Banerjee', 'Joshi', 'Patel', 'Mehta', 'Shah', 'Desai', 'Agarwal', 'Verma', 'Mishra', 'Pandey', 'Chatterjee', 'Mukherjee', 'Bose', 'Das', 'Sen', 'Ghosh', 'Chowdhury', 'Kapoor', 'Malhotra', 'Khanna', 'Bhatia', 'Sethi', 'Arora', 'Chopra', 'Saxena', 'Tiwari', 'Yadav', 'Jain', 'Bhatt', 'Trivedi', 'Deshpande', 'Patil', 'Thakur', 'Gill', 'Singh', 'Kaur', 'Grewal', 'Dhillon', 'Sandhu', 'Raman'],
  },
  india_south: {
    first: ['Karthik', 'Meera', 'Lakshmi', 'Suresh', 'Divya', 'Rajesh', 'Pranav', 'Harsha', 'Aishwarya', 'Deepa', 'Arvind', 'Venkat', 'Madhuri', 'Ramesh', 'Revathi', 'Naveen', 'Harini', 'Kiran', 'Sanjay', 'Nandini', 'Radhika', 'Ravi', 'Anil', 'Sneha', 'Arjun', 'Gayatri', 'Vivek', 'Sowmya'],
    last: ['Iyer', 'Reddy', 'Nair', 'Menon', 'Rao', 'Pillai', 'Krishnan', 'Subramanian', 'Venkatesh', 'Raghavan', 'Srinivasan', 'Naidu', 'Hegde', 'Shetty', 'Kamath', 'Prabhu', 'Ramaswamy', 'Chandrasekhar', 'Varghese', 'Kurian', 'Balakrishnan', 'Murthy', 'Gowda', 'Narayanan', 'Bose'],
  },
  pakistan: {
    first: ['Ahmed', 'Ayesha', 'Fatima', 'Bilal', 'Usman', 'Hira', 'Imran', 'Sana', 'Ali', 'Zara', 'Mahnoor', 'Saad', 'Amna', 'Junaid', 'Iqra', 'Kashif', 'Rabia', 'Asad', 'Mehwish', 'Waqas', 'Shahid', 'Sadia', 'Adnan', 'Maryam', 'Zeeshan', 'Huma', 'Fahad', 'Saima', 'Talha', 'Anam', 'Owais', 'Sobia', 'Haris', 'Aleena', 'Umer', 'Bushra', 'Tahir', 'Nida', 'Rizwan', 'Samina', 'Danish', 'Hassan'],
    last: ['Khan', 'Malik', 'Ahmed', 'Qureshi', 'Siddiqui', 'Butt', 'Sheikh', 'Raza', 'Hussain', 'Iqbal', 'Chaudhry', 'Mirza', 'Awan', 'Baig', 'Abbasi', 'Rana', 'Javed', 'Aslam', 'Bhatti', 'Akhtar', 'Rehman', 'Zaidi', 'Naqvi', 'Rizvi', 'Hashmi', 'Anwar', 'Saleem', 'Tariq', 'Farooq', 'Haider', 'Ghani', 'Memon', 'Lodhi', 'Durrani', 'Yousaf', 'Kazmi', 'Gilani', 'Khattak', 'Noor', 'Ali'],
  },
  china: {
    first: ['Wei', 'Xin', 'Jing', 'Hao', 'Yan', 'Lei', 'Ying', 'Jian', 'Xiaoling', 'Zhiwei', 'Yifan', 'Ruoxi', 'Tianyu', 'Mei', 'Yuhan', 'Zihan', 'Haoran', 'Jiayi', 'Xinyi', 'Yutong', 'Junjie', 'Shuang', 'Peng', 'Qing', 'Fang', 'Ming', 'Lan', 'Yue', 'Zhen', 'Kai', 'Wen', 'Shu-fen', 'Chia-hao', 'Yu-ting'],
    last: ['Chen', 'Wang', 'Zhang', 'Liu', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun', 'Zhu', 'Hu', 'Guo', 'He', 'Lin', 'Luo', 'Gao', 'Liang', 'Zheng', 'Xie', 'Tang', 'Feng', 'Deng', 'Cao', 'Tsai', 'Hsu', 'Chang', 'Wong', 'Chan', 'Leung', 'Lam', 'Ho', 'Cheung', 'Yip', 'Shen'],
  },
  japan: {
    first: ['Kenji', 'Yuki', 'Hana', 'Haruto', 'Sakura', 'Ren', 'Aoi', 'Daichi', 'Yui', 'Takumi', 'Mio', 'Sota', 'Rina', 'Kaito', 'Emi', 'Hiroshi', 'Naoko', 'Shun', 'Akiko', 'Riku', 'Haruka', 'Kazuki', 'Ayaka', 'Yusuke', 'Misaki', 'Taro', 'Nanami', 'Kenta', 'Keiko'],
    last: ['Tanaka', 'Sato', 'Suzuki', 'Takahashi', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Shimizu', 'Mori', 'Ishikawa', 'Ogawa', 'Fujita', 'Okada', 'Hasegawa', 'Endo', 'Aoki', 'Fujii', 'Nishimura', 'Takeda', 'Ueda'],
  },
  korea: {
    first: ['Min-jun', 'Seo-yeon', 'Ji-ho', 'Ha-eun', 'Do-yun', 'Ji-woo', 'Seung-ho', 'Eun-ji', 'Hyun-woo', 'Soo-ah', 'Jae-won', 'Ye-rin', 'Min-seo', 'Joon-young', 'Da-eun', 'Tae-yang', 'Sung-min', 'Hye-jin', 'Woo-jin', 'So-yeon', 'Dong-hyun'],
    last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Shin', 'Seo', 'Kwon', 'Hwang', 'Ahn', 'Song', 'Oh'],
  },
  vietnam: {
    first: ['Linh', 'Minh', 'Anh', 'Huy', 'Thao', 'Duc', 'Trang', 'Khanh', 'Phuong', 'Quang', 'Tuan', 'Hanh', 'Long', 'Mai', 'Nam', 'Thu', 'Bao', 'Ngoc', 'Hieu', 'Vy', 'Dung', 'Hoa'],
    last: ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Phan', 'Vu', 'Vo', 'Dang', 'Bui', 'Do', 'Ho', 'Ngo', 'Duong', 'Ly', 'Trinh', 'Dinh', 'Truong'],
  },
  indonesia_malaysia: {
    first: ['Budi', 'Siti', 'Agus', 'Dewi', 'Rizky', 'Putri', 'Andi', 'Ayu', 'Fajar', 'Indah', 'Hendra', 'Ratna', 'Dimas', 'Wulan', 'Arif', 'Nurul', 'Hafiz', 'Aisyah', 'Irfan', 'Farhana', 'Syafiq', 'Amirah'],
    last: ['Santoso', 'Wijaya', 'Pratama', 'Saputra', 'Hidayat', 'Kusuma', 'Gunawan', 'Setiawan', 'Halim', 'Hakim', 'Rahman', 'Abdullah', 'Ismail', 'Yusof', 'Tan', 'Lim', 'Ong', 'Goh', 'Chua', 'Teo'],
  },
  thailand: {
    first: ['Somchai', 'Nattapong', 'Siriporn', 'Kanya', 'Anan', 'Pim', 'Chaiwat', 'Ploy', 'Thanawat', 'Narumon', 'Kittisak', 'Waraporn'],
    last: ['Srisai', 'Chaiyaporn', 'Wongsuwan', 'Rattanakorn', 'Suksawat', 'Boonmee', 'Thongchai', 'Charoenrat', 'Saetang', 'Phromma', 'Sukprasert', 'Kaewmanee'],
  },
  philippines: {
    first: ['Jose', 'Maria', 'Miguel', 'Angelica', 'Paolo', 'Bianca', 'Kristine', 'Patricia', 'Rommel', 'Jhoanna', 'Carlo', 'Marites', 'Jerome', 'Princess', 'Ramon', 'Liza', 'Rhea', 'Noel', 'Joy', 'Arnel', 'Dexter', 'Maricel', 'Mark', 'Jasmine'],
    last: ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Dela Cruz', 'Garcia', 'Mendoza', 'Villanueva', 'Ramos', 'Castillo', 'Rivera', 'Gonzales', 'Flores', 'Manalo', 'Domingo', 'Soriano', 'Pascual', 'Mercado', 'Magbanua', 'Salvador', 'Tolentino', 'Panganiban', 'Lim', 'Tan'],
  },
};

// Regions: weighted mixes of pools or other regions [design]. Candidate regions (data/regions.js) all appear here.
export const REGIONS = {
  us: [['us', 0.63], ['latam_es', 0.13], ['china', 0.03], ['india_north', 0.025], ['india_south', 0.015], ['korea', 0.015], ['vietnam', 0.015], ['philippines', 0.02], ['arab', 0.015], ['nigeria', 0.015], ['israel', 0.01], ['iran', 0.005], ['japan', 0.01], ['uk_ie', 0.02]],
  canada: [['canada_en', 0.45], ['quebec', 0.22], ['india_north', 0.1], ['china', 0.08], ['philippines', 0.04], ['arab', 0.04], ['us', 0.07]],
  latam: [['latam_es', 0.62], ['brazil', 0.38]],
  weu: [['uk_ie', 0.26], ['france', 0.16], ['germanic', 0.18], ['dutch_be', 0.08], ['nordic', 0.07], ['italy', 0.12], ['iberia', 0.13]],
  eeu: [['poland', 0.3], ['ukraine', 0.2], ['romania', 0.15], ['balkans', 0.14], ['czech_slovak', 0.11], ['hungary', 0.06], ['baltics', 0.04]],
  india: [['india_north', 0.55], ['india_south', 0.45]],
  pakistan: [['pakistan', 1]],
  ph: [['philippines', 0.7], ['vietnam', 0.12], ['indonesia_malaysia', 0.14], ['thailand', 0.04]],
  africa: [['nigeria', 0.3], ['east_africa', 0.25], ['arab', 0.2], ['ghana', 0.08], ['south_africa', 0.08], ['ethiopia', 0.04], ['west_africa_fr', 0.05]],
  mena: [['arab', 0.62], ['turkey', 0.18], ['iran', 0.1], ['israel', 0.1]],
  east_asia: [['china', 0.5], ['japan', 0.3], ['korea', 0.2]],
  sea: [['vietnam', 0.3], ['indonesia_malaysia', 0.4], ['thailand', 0.15], ['philippines', 0.15]],
  south_asia: [['india', 0.85], ['pakistan', 0.15]],
  europe: [['weu', 0.7], ['eeu', 0.3]],
  au: [['uk_ie', 0.45], ['us', 0.2], ['china', 0.1], ['india_north', 0.08], ['vietnam', 0.05], ['italy', 0.05], ['philippines', 0.04], ['arab', 0.03]],
  // Default: the people a US-based SaaS founder meets online in 2026 [design].
  global: [['us', 0.42], ['canada', 0.04], ['weu', 0.15], ['eeu', 0.06], ['latam', 0.07], ['india', 0.07], ['pakistan', 0.015], ['east_asia', 0.06], ['sea', 0.025], ['ph', 0.015], ['africa', 0.04], ['mena', 0.04]],
};

// Country (as written in data/regions.js places, the prospector's geos, etc.) → region or pool.
export const COUNTRIES = {
  US: 'us', USA: 'us', 'United States': 'us', Canada: 'canada', UK: 'uk_ie', 'United Kingdom': 'uk_ie', Ireland: 'uk_ie', France: 'france',
  Germany: 'germanic', Austria: 'germanic', Switzerland: 'germanic', Netherlands: 'dutch_be', Belgium: 'dutch_be', Spain: 'iberia', Portugal: 'iberia',
  Italy: 'italy', Sweden: 'nordic', Denmark: 'nordic', Norway: 'nordic', Finland: 'nordic', EU: 'weu', Europe: 'europe',
  Poland: 'poland', Czechia: 'czech_slovak', Slovakia: 'czech_slovak', Romania: 'romania', Serbia: 'balkans', Croatia: 'balkans', Bulgaria: 'balkans',
  Hungary: 'hungary', Ukraine: 'ukraine', Estonia: 'baltics', Latvia: 'baltics', Lithuania: 'baltics',
  Argentina: 'latam_es', Chile: 'latam_es', Colombia: 'latam_es', Mexico: 'latam_es', Uruguay: 'latam_es', Peru: 'latam_es', Brazil: 'brazil',
  India: 'india', Pakistan: 'pakistan', Philippines: 'philippines', Vietnam: 'vietnam', Malaysia: 'indonesia_malaysia', Indonesia: 'indonesia_malaysia',
  Thailand: 'thailand', Singapore: 'sea', Nigeria: 'nigeria', Ghana: 'ghana', Kenya: 'east_africa', Uganda: 'east_africa', 'South Africa': 'south_africa',
  Ethiopia: 'ethiopia', Senegal: 'west_africa_fr', Egypt: 'arab', Morocco: 'arab', UAE: 'arab', 'Saudi Arabia': 'arab', Jordan: 'arab', Lebanon: 'arab',
  Turkey: 'turkey', Israel: 'israel', Iran: 'iran', China: 'china', Taiwan: 'china', 'Hong Kong': 'china', Japan: 'japan', 'South Korea': 'korea', Korea: 'korea',
  Australia: 'au', 'New Zealand': 'au',
};

// Full names the draw must never produce (famous founders, investors and public figures) even though both halves
// are ordinary names. Lower-case.
export const BLOCKED = new Set([
  'imran khan', 'michael jordan', 'jordan peterson', 'michael jackson', 'jack ma', 'david beckham', 'tom hardy', 'tom holland', 'emma watson',
  'ryan reynolds', 'kevin hart', 'chris evans', 'jennifer lopez', 'george washington', 'taylor swift', 'harry kane', 'grace kelly', 'diana ross',
  'kevin bacon', 'michael bloomberg', 'reid hoffman', 'paul graham', 'jessica livingston', 'sam altman', 'garry tan', 'drew houston', 'brian chesky',
  'patrick collison', 'john collison', 'marc andreessen', 'ben horowitz', 'peter thiel', 'naval ravikant', 'fred wilson', 'josh kopelman',
  'aaron levie', 'tyler winklevoss', 'cameron winklevoss', 'daniel ek', 'stewart butterfield', 'parker conrad', 'ryan smith', 'kevin systrom',
  'jason calacanis', 'chamath palihapitiya', 'sundar pichai', 'satya nadella', 'arvind krishna', 'jensen huang', 'lisa su', 'tim cook',
  'larry page', 'jack dorsey', 'evan spiegel', 'whitney wolfe herd', 'melanie perkins', 'cameron adams', 'andrew ng', 'fei fei li', 'demis hassabis',
  'kai fu lee', 'masayoshi son', 'hiroshi mikitani', 'sophie turner', 'emma stone', 'ryan gosling', 'chris martin', 'adam smith', 'karl marx',
  'martin luther', 'jose mourinho', 'diego maradona', 'lionel messi', 'mohamed salah', 'shah rukh khan', 'salman khan', 'priyanka chopra',
  'virat kohli', 'ma long', 'li na', 'yao ming', 'park ji-sung', 'kim yuna', 'son heung-min', 'kim jong-un', 'thabo mbeki',
]);

const uniq = (a) => [...new Set(a)];
/** Every given name and surname in the bank (deduplicated). */
export const FIRST_NAMES = uniq(Object.values(POOLS).flatMap((p) => p.first));
export const LAST_NAMES = uniq(Object.values(POOLS).flatMap((p) => p.last));
